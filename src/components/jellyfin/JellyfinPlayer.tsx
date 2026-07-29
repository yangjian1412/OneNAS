import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { View, Text, TouchableOpacity, Modal, StyleSheet, Dimensions, ActivityIndicator, Platform, StatusBar, Animated, Alert } from 'react-native'
import { VideoView, useVideoPlayer, type VideoPlayer } from 'expo-video'
import * as ScreenOrientation from 'expo-screen-orientation'
import * as Brightness from 'expo-brightness'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import type { JellyfinItem, JellyfinServerConfig, JellyfinMediaStream, PlaybackReportMethod } from '@/types'
import { useTheme } from '@/lib/theme'
import {
  jellyfinGetStream,
  reportPlaybackStart,
  reportPlaybackProgress,
  reportPlaybackPing,
  reportPlaybackStop,
  markPlayed,
  msToTicks,
  msToTimecode,
  generatePlaySessionId,
} from '@/lib/api/jellyfinPlayback'
import { jellyfinGetEpisodes } from '@/lib/api/jellyfin'
import { enqueueProgress, enqueueStop } from '@/lib/api/jellyfinPlaybackQueue'
import { useJellyfinPlaybackStore } from '@/stores/jellyfinPlaybackStore'
import { getSystemCurrentVolume, getSystemMaxVolume, setSystemVolume } from '@/lib/systemVolume'
import Icon from '@/components/Icon'
import PlayerTrackSheet from './PlayerTrackSheet'
import PlayerSpeedSheet from './PlayerSpeedSheet'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
const HIDE_CONTROLS_MS = 3000
const PROGRESS_INTERVAL_MS = 10_000
const PING_INTERVAL_MS = 60_000
const DOUBLE_TAP_MAX_MS = 300
const DOUBLE_TAP_X_TOLERANCE = 0.15
const LONG_PRESS_MS = 350
const FAST_SCRUB_PLAYBACK_RATE = 3
const FAST_SCRUB_REWIND_STEP_MS = -1000
const FAST_SCRUB_REWIND_TICK_MS = 150
const HORIZONTAL_SEEK_FULL_SCREEN_MS = 60_000 // 1 screen = 60s
const EDGE_ZONE_PCT = 0.2

interface Props {
  visible: boolean
  url: string
  item: JellyfinItem
  server: JellyfinServerConfig
  onClose: () => void
}

export default function JellyfinPlayer({ visible, url, item, server, onClose }: Props) {
  const t = useTheme()
  const prefs = useJellyfinPlaybackStore()
  const playerRef = useRef<VideoPlayer | null>(null)
  const playSessionIdRef = useRef<string>(generatePlaySessionId())
  const reportedStoppedRef = useRef(false)
  const initialBrightnessRef = useRef<number | null>(null)
  const initialVolumeRatioRef = useRef<number | null>(null)
  const fastScrubIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const savedPlaybackRateRef = useRef<number>(1)
  const controlsVisibleRef = useRef(true)
  const isLandscapeRef = useRef(false)
  const durationMsRef = useRef(0)

  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [positionMs, setPositionMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(prefs.defaultPlaybackSpeed)
  const [seeking, setSeeking] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [isLandscape, setIsLandscape] = useState(prefs.landscapeByDefault)

  const [audioStreams, setAudioStreams] = useState<JellyfinMediaStream[]>([])
  const [subtitleStreams, setSubtitleStreams] = useState<JellyfinMediaStream[]>([])
  const [currentAudioIndex, setCurrentAudioIndex] = useState<number>(-1)
  const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState<number>(-1)
  const [mediaSourceId, setMediaSourceId] = useState<string | undefined>(undefined)
  const [playMethod, setPlayMethod] = useState<PlaybackReportMethod>('DirectPlay')

  const [trackSheetVisible, setTrackSheetVisible] = useState(false)
  const [speedSheetVisible, setSpeedSheetVisible] = useState(false)

  const [brightnessPct, setBrightnessPct] = useState<number | null>(null)
  const [volumePct, setVolumePct] = useState<number | null>(null)
  const [horizontalSeekDeltaMs, setHorizontalSeekDeltaMs] = useState<number | null>(null)
  const [overlayText, setOverlayText] = useState<string>('')
  const [overlayFillPct, setOverlayFillPct] = useState(0)

  const controlsOpacity = useRef(new Animated.Value(1)).current
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressBarWidthRef = useRef(1)
  const seekToastAnim = useRef(new Animated.Value(0)).current
  const seekToastText = useRef('')
  const overlayOpacity = useRef(new Animated.Value(0)).current
  // overlay text/percent is set via state for proper re-render
  const [fastScrubSide, setFastScrubSide] = useState<'left' | 'right' | null>(null)
  const fastScrubOpacity = useRef(new Animated.Value(0)).current

  controlsVisibleRef.current = controlsVisible
  isLandscapeRef.current = isLandscape
  durationMsRef.current = durationMs

  const hideControls = useCallback(() => {
    Animated.timing(controlsOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
      setControlsVisible(false)
    })
  }, [controlsOpacity])

  const showControls = useCallback(() => {
    setControlsVisible(true)
    Animated.timing(controlsOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start()
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (isPlaying && !seeking && !fastScrubSide) {
      hideTimerRef.current = setTimeout(hideControls, HIDE_CONTROLS_MS)
    }
  }, [controlsOpacity, isPlaying, seeking, fastScrubSide, hideControls])

  // Auto-hide when playing and no special state
  useEffect(() => {
    if (isPlaying && !seeking && !fastScrubSide && controlsVisible) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(hideControls, HIDE_CONTROLS_MS)
    }
  }, [isPlaying, seeking, fastScrubSide, controlsVisible, hideControls])

  const reportProgressNow = useCallback(async (forcePaused?: boolean) => {
    const player = playerRef.current
    if (!player) return
    const posMs = player.currentTime * 1000
    const paused = forcePaused ?? !player.playing
    const payload = {
      ItemId: item.Id,
      PositionTicks: msToTicks(posMs),
      CanSeek: true,
      IsPaused: paused,
      IsMuted: player.muted,
      Volume: 100,
      PlayMethod: playMethod,
      MediaSourceId: mediaSourceId,
      PlaySessionId: playSessionIdRef.current,
      AudioStreamIndex: currentAudioIndex >= 0 ? currentAudioIndex : undefined,
      SubtitleStreamIndex: currentSubtitleIndex >= 0 ? currentSubtitleIndex : undefined,
    }
    const r = await reportPlaybackProgress(server, payload)
    if (!r.ok) {
      void enqueueProgress(server, payload)
    }
  }, [item.Id, server, playMethod, mediaSourceId, currentAudioIndex, currentSubtitleIndex])

  const handleCloseInternal = useCallback(async () => {
    if (reportedStoppedRef.current) return
    const player = playerRef.current
    if (player) {
      const posMs = player.currentTime * 1000
      const durMs = durationMs > 0 ? durationMs : 1
      const pct = (posMs / durMs) * 100
      const payload = {
        ItemId: item.Id,
        PositionTicks: msToTicks(posMs),
        CanSeek: true,
        IsPaused: true,
        IsMuted: player.muted,
        Volume: 100,
        PlayMethod: playMethod,
        MediaSourceId: mediaSourceId,
        PlaySessionId: playSessionIdRef.current,
        AudioStreamIndex: currentAudioIndex >= 0 ? currentAudioIndex : undefined,
        SubtitleStreamIndex: currentSubtitleIndex >= 0 ? currentSubtitleIndex : undefined,
      }
      const r = await reportPlaybackStop(server, payload)
      if (!r.ok) {
        void enqueueStop(server, payload)
      }
      if (pct >= prefs.markPlayedThresholdPct) {
        void markPlayed(server, item.Id, true)
      } else if (pct < prefs.resetPositionThresholdPct) {
        void markPlayed(server, item.Id, false)
      }
      reportedStoppedRef.current = true
    }
  }, [item.Id, server, durationMs, playMethod, mediaSourceId, currentAudioIndex, currentSubtitleIndex, prefs.markPlayedThresholdPct, prefs.resetPositionThresholdPct])

  useEffect(() => {
    if (!visible) return
    const setup = async () => {
      const result = await jellyfinGetStream(server, item.Id, {
        maxBitrate: prefs.maxBitrate,
        audioStreamIndex: currentAudioIndex >= 0 ? currentAudioIndex : undefined,
        subtitleStreamIndex: currentSubtitleIndex >= 0 ? currentSubtitleIndex : undefined,
        mediaSourceId,
      })
      if (result.ok && result.source) {
        setAudioStreams(result.audioStreams)
        setSubtitleStreams(result.subtitleStreams)
        setMediaSourceId(result.source.Id)
        const defaultAudio = result.audioStreams.find((s) => s.IsDefault)?.Index
          ?? result.audioStreams[0]?.Index
        const defaultSub = result.subtitleStreams.find((s) => s.IsDefault)?.Index ?? -1
        if (defaultAudio != null) setCurrentAudioIndex(defaultAudio)
        if (currentSubtitleIndex === 0 || currentSubtitleIndex === -1) {
          const subtitleLang = prefs.defaultSubtitleLang
          if (subtitleLang) {
            const match = result.subtitleStreams.find((s) => s.Language === subtitleLang)
            if (match) setCurrentSubtitleIndex(match.Index)
            else setCurrentSubtitleIndex(defaultSub)
          } else {
            setCurrentSubtitleIndex(defaultSub)
          }
        }
      }
    }
    void setup()
  }, [visible, item.Id, server.url, prefs.maxBitrate, prefs.defaultSubtitleLang])

  useEffect(() => {
    if (!visible) {
      void handleCloseInternal()
    }
  }, [visible, handleCloseInternal])

  // Capture initial brightness/volume when player opens; restore on close.
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    void (async () => {
      try {
        const b = await Brightness.getBrightnessAsync()
        if (!cancelled) initialBrightnessRef.current = b
      } catch {}
      try {
        const [cur, max] = await Promise.all([getSystemCurrentVolume(), getSystemMaxVolume()])
        if (!cancelled) {
          initialVolumeRatioRef.current = max > 0 ? cur / max : 0
        }
      } catch {}
    })()
    return () => {
      cancelled = true
      // Restore brightness/volume when leaving player
      if (initialBrightnessRef.current != null) {
        void Brightness.setBrightnessAsync(initialBrightnessRef.current).catch(() => {})
      }
      if (initialVolumeRatioRef.current != null) {
        void setSystemVolume(initialVolumeRatioRef.current).catch(() => {})
      }
      // Reset to default layout when leaving
      if (prefs.landscapeByDefault) {
        void ScreenOrientation.unlockAsync().catch(() => {})
      }
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      if (fastScrubIntervalRef.current) clearInterval(fastScrubIntervalRef.current)
    }
  }, [visible, prefs.landscapeByDefault])

  const toggleLandscape = useCallback(async () => {
    try {
      if (isLandscape) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT)
        setIsLandscape(false)
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
        setIsLandscape(true)
      }
    } catch (e) {
      Alert.alert('横屏切换失败', String(e))
    }
  }, [isLandscape])

  const player = useVideoPlayer({ uri: url }, (p) => {
    playerRef.current = p
    p.playbackRate = prefs.defaultPlaybackSpeed
  })

  useEffect(() => {
    if (!player) return
    const subPlaying = player.addListener('playingChange', ({ isPlaying: playing }) => {
      setIsPlaying(playing)
      void reportProgressNow(!playing)
      if (playing) {
        void reportPlaybackStart(server, {
          ItemId: item.Id,
          MediaSourceId: mediaSourceId,
          AudioStreamIndex: currentAudioIndex >= 0 ? currentAudioIndex : undefined,
          SubtitleStreamIndex: currentSubtitleIndex >= 0 ? currentSubtitleIndex : undefined,
          MaxBitrate: prefs.maxBitrate > 0 ? prefs.maxBitrate : undefined,
        }, playSessionIdRef.current)
      }
    })
    const subReady = player.addListener('sourceLoad', () => {
      setIsReady(true)
      const dur = (player.duration || 0) * 1000
      setDurationMs(dur)
      durationMsRef.current = dur
      if (prefs.resumeLastPosition && item.UserData?.PlaybackPositionTicks && player.currentTime < 1) {
        const resumeMs = item.UserData.PlaybackPositionTicks / 10000
        p_seekTo(resumeMs)
      }
      // Auto-play after source is ready
      try { player.play() } catch {}
    })
    const subTime = player.addListener('timeUpdate', ({ currentTime }) => {
      setPositionMs(currentTime * 1000)
      if (!seeking) {
        const dur = player.duration
        if (dur > 0 && durationMs !== dur * 1000) setDurationMs(dur * 1000)
      }
    })
    const subEnd = player.addListener('playToEnd', async () => {
      setIsPlaying(false)
      void reportProgressNow(true)
      void handleCloseInternal()
      if (prefs.autoPlayNextEpisode && item.Type === 'Episode' && item.SeriesId) {
        try {
          await playNextEpisode()
        } catch {}
      }
    })
    const subError = player.addListener('statusChange', (e: any) => {
      if (e?.error) setError(e.error.message || '播放出错')
    })

    progressTimerRef.current = setInterval(() => {
      if (player.playing) void reportProgressNow()
    }, PROGRESS_INTERVAL_MS)
    pingTimerRef.current = setInterval(() => {
      if (player.playing) {
        void reportPlaybackPing(server, {
          ItemId: item.Id,
          PositionTicks: msToTicks(player.currentTime * 1000),
          CanSeek: true,
          IsPaused: false,
          IsMuted: player.muted,
          Volume: 100,
          PlayMethod: playMethod,
          MediaSourceId: mediaSourceId,
          PlaySessionId: playSessionIdRef.current,
          AudioStreamIndex: currentAudioIndex >= 0 ? currentAudioIndex : undefined,
          SubtitleStreamIndex: currentSubtitleIndex >= 0 ? currentSubtitleIndex : undefined,
        })
      }
    }, PING_INTERVAL_MS)

    return () => {
      subPlaying.remove()
      subReady.remove()
      subTime.remove()
      subEnd.remove()
      subError.remove()
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
    }
  }, [player])

  function p_seekTo(ms: number) {
    if (playerRef.current) playerRef.current.currentTime = Math.max(0, ms / 1000)
  }

  const playNextEpisode = useCallback(async () => {
    if (!item.SeriesId || !item.SeasonId || item.IndexNumber == null) return
    const res = await jellyfinGetEpisodes(server, item.SeriesId, item.SeasonId)
    if (!res.ok || !res.episodes) return
    const next = res.episodes.find((e) => e.IndexNumber === (item.IndexNumber ?? -1) + 1)
    if (!next) return
    const stream = await jellyfinGetStream(server, next.Id, {
      maxBitrate: prefs.maxBitrate > 0 ? prefs.maxBitrate : undefined,
    })
    if (!stream.ok || !stream.url) return
    playSessionIdRef.current = generatePlaySessionId()
    reportedStoppedRef.current = false
    setMediaSourceId(stream.source?.Id)
    setAudioStreams(stream.audioStreams)
    setSubtitleStreams(stream.subtitleStreams)
    const audioIdx = stream.audioStreams.find((s) => s.IsDefault)?.Index ?? stream.audioStreams[0]?.Index ?? -1
    const subIdx = stream.subtitleStreams.find((s) => s.IsDefault)?.Index ?? -1
    setCurrentAudioIndex(audioIdx)
    setCurrentSubtitleIndex(subIdx)
    if (playerRef.current) {
      playerRef.current.replace({ uri: stream.url })
      playerRef.current.play()
    }
  }, [item, server, prefs.maxBitrate])

  const showSeekToast = useCallback((text: string) => {
    seekToastText.current = text
    seekToastAnim.setValue(1)
    Animated.timing(seekToastAnim, { toValue: 0, duration: 600, useNativeDriver: true }).start()
  }, [seekToastAnim])

  const showOverlay = useCallback((text: string, fillPct: number) => {
    setOverlayText(text)
    setOverlayFillPct(fillPct)
    overlayOpacity.setValue(1)
    Animated.timing(overlayOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start()
  }, [overlayOpacity])

  const seekBy = useCallback((deltaMs: number) => {
    if (!playerRef.current) return
    const pos = (playerRef.current.currentTime * 1000) + deltaMs
    const dur = playerRef.current.duration * 1000
    const target = Math.max(0, dur > 0 ? Math.min(pos, dur - 500) : pos)
    p_seekTo(target)
    setPositionMs(target)
    void reportProgressNow()
    showSeekToast(deltaMs > 0 ? `+${deltaMs / 1000}秒` : `${deltaMs / 1000}秒`)
  }, [reportProgressNow, showSeekToast])

  const togglePlay = useCallback(() => {
    if (!playerRef.current) return
    if (playerRef.current.playing) playerRef.current.pause()
    else playerRef.current.play()
  }, [])

  const toggleMute = useCallback(() => {
    if (!playerRef.current) return
    playerRef.current.muted = !playerRef.current.muted
    setIsMuted(playerRef.current.muted)
    void reportProgressNow()
  }, [reportProgressNow])

  const handleTrackTap = useCallback(() => {
    setTrackSheetVisible(true)
    showControls()
  }, [showControls])

  const onSelectAudio = useCallback((index: number) => {
    setCurrentAudioIndex(index)
    if (playerRef.current) {
      const tracks = (playerRef.current as any).availableAudioTracks as Array<{ id?: string }> | undefined
      const match = tracks?.find((t, i) => i === index || t.id === String(index))
      try {
        ;(playerRef.current as any).audioTrack = match ?? null
      } catch {}
    }
    void reportProgressNow()
  }, [reportProgressNow])

  const onSelectSubtitle = useCallback((index: number) => {
    setCurrentSubtitleIndex(index)
    if (playerRef.current) {
      if (index < 0) {
        try {
          ;(playerRef.current as any).subtitleTrack = null
        } catch {}
      } else {
        const tracks = (playerRef.current as any).availableSubtitleTracks as Array<{ id?: string }> | undefined
        const match = tracks?.find((t, i) => i === index || t.id === String(index))
        try {
          ;(playerRef.current as any).subtitleTrack = match ?? null
        } catch {}
      }
    }
    void reportProgressNow()
  }, [reportProgressNow])

  // --- Fast-scrub (long press) ---
  const startFastScrub = useCallback((side: 'left' | 'right') => {
    const player = playerRef.current
    if (!player) return
    savedPlaybackRateRef.current = player.playbackRate || playbackRate
    if (side === 'right') {
      player.playbackRate = FAST_SCRUB_PLAYBACK_RATE
    } else {
      // First tick immediately, then interval
      const tick = () => {
        const p = playerRef.current
        if (!p) return
        const target = Math.max(0, p.currentTime * 1000 + FAST_SCRUB_REWIND_STEP_MS)
        p.currentTime = target / 1000
        setPositionMs(target)
        fastScrubIntervalRef.current = setTimeout(tick, FAST_SCRUB_REWIND_TICK_MS)
      }
      tick()
    }
    setFastScrubSide(side)
    fastScrubOpacity.setValue(0)
    Animated.timing(fastScrubOpacity, { toValue: 1, duration: 120, useNativeDriver: true }).start()
    showControls()
  }, [playbackRate, fastScrubOpacity, showControls])

  const stopFastScrub = useCallback(() => {
    const player = playerRef.current
    if (fastScrubIntervalRef.current) {
      clearTimeout(fastScrubIntervalRef.current)
      fastScrubIntervalRef.current = null
    }
    if (player) {
      player.playbackRate = savedPlaybackRateRef.current
    }
    if (fastScrubSide) {
      Animated.timing(fastScrubOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
        setFastScrubSide(null)
      })
    }
  }, [fastScrubOpacity, fastScrubSide])

  // --- Composed gesture (RNGH) ---
  const videoWidth = isLandscape ? SCREEN_H : SCREEN_W
  const videoHeight = isLandscape ? SCREEN_W : SCREEN_H

  const tapGesture = useMemo(() =>
    Gesture.Tap()
      .numberOfTaps(1)
      .maxDuration(250)
      .runOnJS(true)
      .onEnd(() => {
        if (controlsVisibleRef.current) {
          hideControls()
        } else {
          showControls()
        }
      }),
    [hideControls, showControls],
  )

  const doubleTapGesture = useMemo(() =>
    Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(DOUBLE_TAP_MAX_MS)
      .runOnJS(true)
      .onEnd((e) => {
        const xRatio = e.x / videoWidth
        if (xRatio < EDGE_ZONE_PCT) {
          seekBy(-prefs.doubleTapBackMs)
        } else if (xRatio > 1 - EDGE_ZONE_PCT) {
          seekBy(prefs.doubleTapForwardMs)
        } else {
          togglePlay()
        }
      }),
    [videoWidth, prefs.doubleTapBackMs, prefs.doubleTapForwardMs, seekBy, togglePlay],
  )

  const longPressGesture = useMemo(() =>
    Gesture.LongPress()
      .minDuration(LONG_PRESS_MS)
      .runOnJS(true)
      .onStart((e) => {
        const xRatio = e.x / videoWidth
        if (xRatio < EDGE_ZONE_PCT) startFastScrub('left')
        else if (xRatio > 1 - EDGE_ZONE_PCT) startFastScrub('right')
      })
      .onEnd(() => stopFastScrub())
      .onFinalize(() => stopFastScrub()),
    [videoWidth, startFastScrub, stopFastScrub],
  )

  const horizontalSeekBaseRef = useRef<number | null>(null)

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .minDistance(8)
      .runOnJS(true)
      .onBegin((e) => {
        // Determine gesture type by initial direction (1st 30px of movement)
      })
      .onUpdate((e) => {
        const absDx = Math.abs(e.translationX)
        const absDy = Math.abs(e.translationY)
        if (absDx > absDy && absDx > 10) {
          // Horizontal: seek (1 screen = 60s)
          const seekDeltaMs = (e.translationX / SCREEN_W) * HORIZONTAL_SEEK_FULL_SCREEN_MS
          const basePos = playerRef.current?.currentTime ? playerRef.current.currentTime * 1000 : 0
          // Calculate target based on the saved start position
          if (horizontalSeekDeltaMs === null && playerRef.current) {
            // first update — set base
            horizontalSeekBaseRef.current = playerRef.current.currentTime * 1000
          }
          const base = horizontalSeekBaseRef.current ?? basePos
          const target = Math.max(0, Math.min(durationMsRef.current - 500, base + seekDeltaMs))
          setHorizontalSeekDeltaMs(seekDeltaMs)
          if (playerRef.current) playerRef.current.currentTime = target / 1000
        } else if (absDy > 10) {
          // Vertical
          const xRatio = e.x / videoWidth
          if (xRatio < EDGE_ZONE_PCT) {
            // Brightness (up = brighter)
            const ratio = Math.max(0, Math.min(1, 1 - e.translationY / SCREEN_H))
            void Brightness.setBrightnessAsync(ratio)
            setBrightnessPct(ratio)
            showOverlay(`亮度 ${Math.round(ratio * 100)}%`, ratio)
          } else if (xRatio > 1 - EDGE_ZONE_PCT) {
            // Volume (up = louder)
            const ratio = Math.max(0, Math.min(1, 1 - e.translationY / SCREEN_H))
            void setSystemVolume(ratio)
            setVolumePct(ratio)
            showOverlay(`音量 ${Math.round(ratio * 100)}%`, ratio)
          }
        }
      })
      .onEnd(() => {
        setBrightnessPct(null)
        setVolumePct(null)
        setHorizontalSeekDeltaMs(null)
        horizontalSeekBaseRef.current = null
        void reportProgressNow()
      })
      .onFinalize(() => {
        setBrightnessPct(null)
        setVolumePct(null)
        setHorizontalSeekDeltaMs(null)
        horizontalSeekBaseRef.current = null
      }),
    [videoWidth, showOverlay, reportProgressNow],
  )

  // Compose: long press + double tap + single tap + pan
  const composedGesture = useMemo(() =>
    Gesture.Race(
      Gesture.Race(longPressGesture, panGesture),
      Gesture.Exclusive(doubleTapGesture, tapGesture),
    ),
    [longPressGesture, panGesture, doubleTapGesture, tapGesture],
  )

  const progressPct = durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0

  const progressBarGesture = useMemo(() =>
    Gesture.Pan()
      .minDistance(0)
      .runOnJS(true)
      .onBegin((e) => {
        const width = progressBarWidthRef.current || 1
        const xRatio = Math.max(0, Math.min(1, e.x / width))
        setSeeking(true)
        showControls()
        setPositionMs(xRatio * durationMs)
      })
      .onUpdate((e) => {
        const width = progressBarWidthRef.current || 1
        const xRatio = Math.max(0, Math.min(1, e.x / width))
        setPositionMs(xRatio * durationMs)
      })
      .onEnd((e) => {
        const width = progressBarWidthRef.current || 1
        const xRatio = Math.max(0, Math.min(1, e.x / width))
        const targetMs = xRatio * durationMs
        setSeeking(false)
        p_seekTo(targetMs)
        void reportProgressNow()
      }),
    [durationMs, showControls, reportProgressNow],
  )

  const pt = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0
  const speedLabel = playbackRate === 1.0 ? '1x' : `${playbackRate}x`
  const isVolumeMutedIcon = isMuted || (volumePct !== null && volumePct < 0.01)

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.container, { backgroundColor: '#000' }]}>
        <GestureDetector gesture={composedGesture}>
          <View style={[styles.videoTouch, { width: videoWidth, height: videoHeight }]}>
            {error ? (
              <View style={styles.center}>
                <Icon name="alertCircle" size={48} color="#ff5252" />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.errorBtn} onPress={onClose}>
                  <Text style={styles.errorBtnText}>关闭</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {!isReady && (
                  <ActivityIndicator size="large" color="#fff" style={styles.loader} />
                )}
                <VideoView
                  style={[styles.video, { width: videoWidth, height: videoHeight }, !isReady && styles.hidden]}
                  player={player}
                  allowsPictureInPicture={false}
                  nativeControls={false}
                />
              </>
            )}

            <Animated.View
              pointerEvents="none"
              style={[
                styles.seekToast,
                {
                  opacity: seekToastAnim,
                  transform: [{
                    scale: seekToastAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
                  }],
                },
              ]}
            >
              <Text style={styles.seekToastText}>{seekToastText.current}</Text>
            </Animated.View>

            {fastScrubSide && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.fastScrubBadge,
                  fastScrubSide === 'left' ? styles.fastScrubLeft : styles.fastScrubRight,
                  {
                    opacity: fastScrubOpacity,
                    transform: [{
                      scale: fastScrubOpacity.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
                    }],
                  },
                ]}
              >
                <Icon
                  name={fastScrubSide === 'left' ? 'fastRewind' : 'fastForward'}
                  size={32}
                  color="#fff"
                />
                <Text style={styles.fastScrubText}>{FAST_SCRUB_PLAYBACK_RATE}x</Text>
              </Animated.View>
            )}
          </View>
        </GestureDetector>

        {/* Brightness/Volume/HSeek overlay (center of screen) */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.centerOverlay,
            { opacity: overlayOpacity },
          ]}
        >
          <View style={styles.overlayCard}>
            <Text style={styles.overlayText}>{overlayText}</Text>
            <View style={styles.overlayBar}>
              <View style={[styles.overlayFill, { width: `${overlayFillPct * 100}%` }]} />
            </View>
          </View>
        </Animated.View>

        {controlsVisible && (
          <Animated.View
            pointerEvents="box-none"
            style={[styles.controlsOverlay, { opacity: controlsOpacity }]}
          >
            <View style={[styles.topBar, { paddingTop: pt + 4 }]}>
              <TouchableOpacity onPress={onClose} style={styles.topBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="chevronLeft" size={26} color="#fff" />
              </TouchableOpacity>
              <View style={styles.titleWrap}>
                <Text style={styles.title} numberOfLines={1}>{item.Name}</Text>
                {item.SeriesName && (
                  <Text style={styles.seriesName} numberOfLines={1}>
                    {item.SeriesName}
                    {item.IndexNumber != null ? ` · 第 ${item.IndexNumber} 集` : ''}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={toggleLandscape} style={styles.topBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="rotate" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.bottomBar}>
              <GestureDetector gesture={progressBarGesture}>
                <View
                  onLayout={(e) => {
                    progressBarWidthRef.current = e.nativeEvent.layout.width
                  }}
                  collapsable={false}
                  style={styles.progressTrack}
                >
                  <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: t.primary }]} />
                  <View style={[styles.progressKnob, { left: `${progressPct}%`, backgroundColor: t.primary }]} />
                </View>
              </GestureDetector>

              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{msToTimecode(positionMs)}</Text>
                <Text style={styles.timeText}>{msToTimecode(durationMs)}</Text>
              </View>

              <View style={styles.btnRow}>
                <TouchableOpacity onPress={() => seekBy(-prefs.skipBackMs)} style={styles.btn} disabled={!!error}>
                  <Icon name="fastRewind" size={30} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity onPress={togglePlay} style={styles.btn} disabled={!!error}>
                  <Icon name={isPlaying ? 'pauseRounded' : 'playFilled'} size={36} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity onPress={() => seekBy(prefs.skipForwardMs)} style={styles.btn} disabled={!!error}>
                  <Icon name="fastForward" size={30} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity onPress={toggleMute} style={styles.btn}>
                  <Icon name={isVolumeMutedIcon ? 'volumeMute' : 'volumeHigh'} size={26} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setSpeedSheetVisible(true)} style={styles.btn}>
                  <Text style={[styles.speedText, { color: playbackRate !== 1.0 ? t.primary : '#fff' }]}>
                    {speedLabel}
                  </Text>
                </TouchableOpacity>

                {(audioStreams.length > 0 || subtitleStreams.length > 0) ? (
                  <TouchableOpacity onPress={handleTrackTap} style={styles.btn}>
                    <Icon
                      name="captions"
                      size={26}
                      color={currentSubtitleIndex >= 0 ? t.primary : '#fff'}
                    />
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity onPress={toggleLandscape} style={styles.btn}>
                  <Icon name={isLandscape ? 'exitFullscreen' : 'fullscreen'} size={26} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        )}
      </View>

      <PlayerTrackSheet
        visible={trackSheetVisible}
        audioStreams={audioStreams}
        subtitleStreams={subtitleStreams}
        currentAudioIndex={currentAudioIndex}
        currentSubtitleIndex={currentSubtitleIndex}
        onSelectAudio={onSelectAudio}
        onSelectSubtitle={onSelectSubtitle}
        onClose={() => setTrackSheetVisible(false)}
      />

      <PlayerSpeedSheet
        visible={speedSheetVisible}
        currentSpeed={playbackRate}
        player={playerRef.current}
        onClose={() => setSpeedSheetVisible(false)}
      />
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  videoTouch: { justifyContent: 'center', alignItems: 'center' },
  video: { backgroundColor: '#000' },
  hidden: { opacity: 0 },
  loader: { position: 'absolute' },
  errorText: { color: '#ff5252', fontSize: 14, marginTop: 12, textAlign: 'center', paddingHorizontal: 24 },
  errorBtn: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8, backgroundColor: '#fff' },
  errorBtnText: { color: '#000', fontSize: 14, fontWeight: '600' },

  controlsOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  topBtn: { padding: 8, minWidth: 40, alignItems: 'center' },
  titleWrap: { flex: 1, paddingHorizontal: 8 },
  title: { color: '#fff', fontSize: 16, fontWeight: '600' },
  seriesName: { color: '#ccc', fontSize: 12, marginTop: 2 },

  bottomBar: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 28,
  },
  progressTrack: {
    height: 36,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
  },
  progressKnob: {
    position: 'absolute',
    marginLeft: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  timeText: { color: '#ccc', fontSize: 12, fontVariant: ['tabular-nums'] },

  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 6,
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
    paddingVertical: 4,
  },
  speedText: { fontSize: 18, fontWeight: '600' },

  seekToast: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    minWidth: 100,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  seekToastText: { color: '#fff', fontSize: 22, fontWeight: '600' },

  fastScrubBadge: {
    position: 'absolute',
    top: '38%',
    width: 90,
    height: 90,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fastScrubLeft: { left: '15%' },
  fastScrubRight: { right: '15%' },
  fastScrubText: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 4 },

  centerOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayCard: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    minWidth: 200,
    alignItems: 'center',
  },
  overlayText: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  overlayBar: {
    width: 160,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  overlayFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
})