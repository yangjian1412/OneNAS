import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { View, Text, TouchableOpacity, Modal, StyleSheet, Dimensions, ActivityIndicator, Platform, StatusBar, Animated, Alert, AppState } from 'react-native'
import { VideoView, useVideoPlayer, type VideoPlayer } from 'expo-video'
import * as ScreenOrientation from 'expo-screen-orientation'
import type { Orientation } from 'expo-screen-orientation'
import * as Brightness from 'expo-brightness'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
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
import { useJellyfinStore } from '@/stores/jellyfinStore'
import { getSystemCurrentVolume, getSystemMaxVolume, setSystemVolume } from '@/lib/systemVolume'
import { useImmersive } from '@/lib/immersive'
import Icon from '@/components/Icon'
import PlayerTrackSheet from './PlayerTrackSheet'
import PlayerSpeedSheet from './PlayerSpeedSheet'
import CastDeviceListModal from '@/components/CastDeviceListModal'
import { useJellyfinCastStore } from '@/stores/jellyfinCastStore'
import type { UpnpDevice } from '@/lib/upnp/types'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
const HIDE_CONTROLS_MS = 5000
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
  useImmersive(visible)
  const playerRef = useRef<VideoPlayer | null>(null)
  const playSessionIdRef = useRef<string>(generatePlaySessionId())
  const reportedStoppedRef = useRef(false)
  const initialBrightnessRef = useRef<number | null>(null)
  const lastBrightnessRef = useRef<number | null>(null)
  const initialVolumeRatioRef = useRef<number | null>(null)
  const initialOrientationRef = useRef<Orientation | null>(null)
  const fastScrubIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const savedPlaybackRateRef = useRef<number>(1)
  const controlsVisibleRef = useRef(true)
  const isLandscapeRef = useRef(false)
  const durationMsRef = useRef(0)
  const fastScrubSideRef = useRef<'left' | 'right' | null>(null)
  const fastScrubStoppedRef = useRef(false)
  const startBrightnessRef = useRef(1)
  const startVolumeRatioRef = useRef(1)
  const brightnessVolumeRangePx = SCREEN_H * 0.4

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
  // 当前播放的 item prop 的内部副本；播放下一集时 setCurrentItem(next) 更新（item prop 是父组件传入不可变）
  const [currentItem, setCurrentItem] = useState<JellyfinItem>(item)
  // 同步给 ref 让事件监听器（sourceLoad / playingChange / playToEnd / 轮询）始终读到最新值，
  // 避免陈旧闭包在播下一集时把上报 ItemId 写成旧 item
  const currentItemRef = useRef<JellyfinItem>(item)
  useEffect(() => {
    setCurrentItem(item)
    currentItemRef.current = item
  }, [item])
  useEffect(() => {
    currentItemRef.current = currentItem
  }, [currentItem])

  const [trackSheetVisible, setTrackSheetVisible] = useState(false)
  const [speedSheetVisible, setSpeedSheetVisible] = useState(false)
  const [castPickerVisible, setCastPickerVisible] = useState(false)

  const [brightnessPct, setBrightnessPct] = useState<number | null>(null)
  const [volumePct, setVolumePct] = useState<number | null>(null)
  const [horizontalSeekDeltaMs, setHorizontalSeekDeltaMs] = useState<number | null>(null)
  const [seekPreviewText, setSeekPreviewText] = useState<string | null>(null)
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
  fastScrubSideRef.current = fastScrubSide

  const hideControls = useCallback(() => {
    Animated.timing(controlsOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
      setControlsVisible(false)
    })
  }, [controlsOpacity])

  const showControls = useCallback(() => {
    setControlsVisible(true)
    Animated.timing(controlsOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start()
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    // 不依赖 isPlaying：暂停时显示控件也应在 5s 后自动消失（用户拖进度条/长按快进时除外）
    if (!seeking && !fastScrubSideRef.current) {
      hideTimerRef.current = setTimeout(hideControls, HIDE_CONTROLS_MS)
    }
  }, [controlsOpacity, seeking, hideControls])

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
      ItemId: currentItem.Id,
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
  }, [currentItem.Id, server, playMethod, mediaSourceId, currentAudioIndex, currentSubtitleIndex])
  // 让 setInterval（不被 currentItem 变化触发）始终调到最新的 reportProgressNow（带最新 ItemId）
  const reportProgressNowRef = useRef(reportProgressNow)
  useEffect(() => { reportProgressNowRef.current = reportProgressNow }, [reportProgressNow])

  const handleCloseInternal = useCallback(async () => {
    if (reportedStoppedRef.current) return
    const player = playerRef.current
    const posMs = player ? player.currentTime * 1000 : positionMs
    const durMs = durationMs > 0 ? durationMs : 1
    const pct = (posMs / durMs) * 100
    // 用 ref 读最新 ItemId，避免自动播下一集后旧闭包写错 itemId
    const itemId = currentItemRef.current.Id
    const payload = {
      ItemId: itemId,
      PositionTicks: msToTicks(posMs),
      CanSeek: true,
      IsPaused: true,
      IsMuted: player?.muted ?? false,
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
      void markPlayed(server, itemId, true)
    } else if (pct < prefs.resetPositionThresholdPct) {
      void markPlayed(server, itemId, false)
    }
    reportedStoppedRef.current = true
    // 主动刷新"继续观看"列表（播放器关闭时一定走了这里）
    void useJellyfinStore.getState().refreshResume()
  }, [server, positionMs, durationMs, playMethod, mediaSourceId, currentAudioIndex, currentSubtitleIndex, prefs.markPlayedThresholdPct, prefs.resetPositionThresholdPct])

  useEffect(() => { handleCloseInternalRef.current = handleCloseInternal }, [handleCloseInternal])

  // 统一的关闭入口：先 await handleCloseInternal（上报 stop + markPlayed + refreshResume），再触发卸载
  const handleClose = useCallback(async () => {
    await handleCloseInternalRef.current?.()
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!visible) return
    const setup = async () => {
      const result = await jellyfinGetStream(server, currentItem.Id, {
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
  }, [visible, currentItem.Id, server.url, prefs.maxBitrate, prefs.defaultSubtitleLang])

  useEffect(() => {
    if (!visible) {
      void handleCloseInternal()
    }
  }, [visible, handleCloseInternal])

  // Capture initial brightness/volume/orientation when player opens; restore on close.
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    void (async () => {
      try {
        const b =
          typeof Brightness.getSystemBrightnessAsync === 'function'
            ? await Brightness.getSystemBrightnessAsync()
            : await Brightness.getBrightnessAsync()
        if (!cancelled) {
          initialBrightnessRef.current = b
          lastBrightnessRef.current = b
        }
      } catch {
        try {
          const b = await Brightness.getBrightnessAsync()
          if (!cancelled) {
            initialBrightnessRef.current = b
            lastBrightnessRef.current = b
          }
        } catch {}
      }
      try {
        const [cur, max] = await Promise.all([getSystemCurrentVolume(), getSystemMaxVolume()])
        if (!cancelled) {
          initialVolumeRatioRef.current = max > 0 ? cur / max : 0
        }
      } catch {}
      try {
        const ori = await ScreenOrientation.getOrientationAsync()
        if (!cancelled) initialOrientationRef.current = ori
      } catch {}
    })()
    return () => {
      cancelled = true
      // Restore brightness/volume when leaving player: drop the window override so
      // the app follows the system brightness again (incl. adaptive brightness).
      void Brightness.restoreSystemBrightnessAsync().catch(() => {
        if (initialBrightnessRef.current != null) {
          return Brightness.setBrightnessAsync(initialBrightnessRef.current)
        }
        return Promise.resolve()
      })
      if (initialVolumeRatioRef.current != null) {
        void setSystemVolume(initialVolumeRatioRef.current).catch(() => {})
      }
      // Always unlock orientation (will fall back to default which matches app startup)
      void ScreenOrientation.unlockAsync().catch(() => {})
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      if (fastScrubIntervalRef.current) clearInterval(fastScrubIntervalRef.current)
    }
  }, [visible])

  // When the app goes to background, follow system brightness again for that moment;
  // on foreground while still in player, re-apply the last user-selected brightness.
  useEffect(() => {
    if (!visible) return
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        void Brightness.restoreSystemBrightnessAsync().catch(() => {})
      } else if (state === 'active') {
        if (lastBrightnessRef.current != null) {
          void Brightness.setBrightnessAsync(lastBrightnessRef.current).catch(() => {})
        }
      }
    })
    return () => sub.remove()
  }, [visible])

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
    // expo-video 的 timeUpdateEventInterval 默认 0（事件禁用），会导致进度条不更新
    // 设为 0.25（4 Hz）开启 timeUpdate，跟 expo-audio 的 playbackStatusUpdate 对齐
    p.timeUpdateEventInterval = 0.25
    p.playbackRate = prefs.defaultPlaybackSpeed
    // expo-video Android 默认 preservesPitch = false（iOS 默认 true），导致加速播放时音调跟速度走（"chipmunk effect"）
    // expo-audio Android 默认 true，所以音频/视频播放器音调不一致。强制 true 让 ExoPlayer 用音调保持算法
    p.preservesPitch = true
    if (!prefs.resumeLastPosition || !currentItem.UserData?.PlaybackPositionTicks) {
      try { p.play() } catch {}
    }
  })

  useEffect(() => {
    if (!player) return
    const subPlaying = player.addListener('playingChange', ({ isPlaying: playing }) => {
      setIsPlaying(playing)
      void reportProgressNowRef.current(!playing)
      if (playing) {
        void reportPlaybackStart(server, {
          ItemId: currentItemRef.current.Id,
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
      // 用 currentItemRef 读最新 item 的 UserData（playNextEpisode 切换后也是新的）
      const it = currentItemRef.current
      if (prefs.resumeLastPosition && it.UserData?.PlaybackPositionTicks && player.currentTime < 1) {
        const resumeMs = it.UserData.PlaybackPositionTicks / 10000
        p_seekTo(resumeMs)
        setPositionMs(resumeMs)
      }
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
      void reportProgressNowRef.current(true)
      await handleCloseInternalRef.current?.()
      const it = currentItemRef.current
      if (useJellyfinPlaybackStore.getState().autoPlayNextEpisode && it.Type === 'Episode' && it.SeriesId) {
        try {
          await playNextEpisode()
        } catch {}
      }
    })
    const subError = player.addListener('statusChange', (e: any) => {
      if (e?.error) setError(e.error.message || '播放出错')
    })

    progressTimerRef.current = setInterval(() => {
      if (player.playing) void reportProgressNowRef.current()
    }, PROGRESS_INTERVAL_MS)
    pingTimerRef.current = setInterval(() => {
      if (player.playing) {
        void reportPlaybackPing(server, {
          ItemId: currentItemRef.current.Id,
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
    // 读 ref 避免闭包陈旧：playToEnd listener 只在 [player] 初始化时注册一次，
    // 捕获的 playNextEpisode 永远是初始版本，但 currentItemRef.current 始终最新
    const cur = currentItemRef.current
    if (!cur.SeriesId || !cur.SeasonId || cur.IndexNumber == null) return
    await handleCloseInternalRef.current?.()
    const res = await jellyfinGetEpisodes(server, cur.SeriesId, cur.SeasonId)
    if (!res.ok || !res.episodes) return
    const next = res.episodes.find((e) => e.IndexNumber === (cur.IndexNumber ?? -1) + 1)
    if (!next) return
    const resumeTicks = prefs.resumeLastPosition ? next.UserData?.PlaybackPositionTicks : undefined
    const stream = await jellyfinGetStream(server, next.Id, {
      maxBitrate: prefs.maxBitrate > 0 ? prefs.maxBitrate : undefined,
      startPositionTicks: resumeTicks,
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
    setCurrentItem(next) // 切换到下一集后更新内部 item，标题/集数/封面都跟着变
    if (playerRef.current) {
      playerRef.current.replace({ uri: stream.url })
      // preservePitch 是 player 实例属性，replace 不重置；显式再设一次以防其他代码路径意外清掉
      playerRef.current.preservesPitch = true
      // 若有保存进度，replace 后立即 seek；否则 sourceLoad 监听器（基于 currentItemRef.current）会按需 seek
      if (resumeTicks && resumeTicks > 0) {
        const resumeMs = resumeTicks / 10000
        // 等 sourceLoad 完成（player.currentTime 重置）再 seek；用一个短暂延迟
        setTimeout(() => {
          if (playerRef.current) {
            playerRef.current.currentTime = resumeMs / 1000
            setPositionMs(resumeMs)
          }
        }, 100)
      } else {
        setPositionMs(0)
      }
      playerRef.current.play()
    }
    // 主动刷新"继续观看"列表，让服务端进度同步到主界面（避免依赖 30s TTL 缓存）
    void useJellyfinStore.getState().refreshResume()
  }, [server, prefs.maxBitrate, prefs.resumeLastPosition])

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

  const handleCloseInternalRef = useRef<() => Promise<void>>(async () => {})
  const handleCastPick = useCallback((target: UpnpDevice) => {
    if (!currentItem?.Id) return
    void useJellyfinCastStore.getState().startCast(server, target, currentItem.Id, currentItem.Name, {
      startPositionSeconds: positionMs / 1000,
      durationSeconds: durationMs / 1000,
    }).then((r) => {
      if (!r.ok) {
        Alert.alert('投屏失败', r.error ?? '未知错误')
        return
      }
      setCastPickerVisible(false)
      handleCloseInternalRef.current?.()
      // 投屏成功：停本地播放 + 关闭 JellyfinPlayer，让 CastRemotePage 接管
      if (playerRef.current) {
        playerRef.current.pause()
      }
      onClose()
    })
  }, [server, item, positionMs, durationMs, onClose])

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
    fastScrubStoppedRef.current = false
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
    if (fastScrubStoppedRef.current) return
    fastScrubStoppedRef.current = true
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
    hideControls()
  }, [fastScrubOpacity, fastScrubSide, hideControls])

  // --- Composed gesture (RNGH) ---
  const videoWidth = isLandscape ? SCREEN_H : SCREEN_W
  const videoHeight = isLandscape ? SCREEN_W : SCREEN_H

  const horizontalSeekBaseRef = useRef<number | null>(null)

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .minDistance(8)
      .runOnJS(true)
      .onBegin((e) => {
        void (async () => {
          try {
            startBrightnessRef.current = await Brightness.getBrightnessAsync()
          } catch {}
          try {
            const [cur, max] = await Promise.all([getSystemCurrentVolume(), getSystemMaxVolume()])
            startVolumeRatioRef.current = max > 0 ? cur / max : 0
          } catch {}
        })()
      })
      .onUpdate((e) => {
        const absDx = Math.abs(e.translationX)
        const absDy = Math.abs(e.translationY)
        if (absDx > absDy && absDx > 10) {
          // Horizontal: seek (1 screen = 60s)
          const seekDeltaMs = (e.translationX / SCREEN_W) * HORIZONTAL_SEEK_FULL_SCREEN_MS
          const basePos = playerRef.current?.currentTime ? playerRef.current.currentTime * 1000 : 0
          if (horizontalSeekBaseRef.current === null && playerRef.current) {
            horizontalSeekBaseRef.current = playerRef.current.currentTime * 1000
          }
          const base = horizontalSeekBaseRef.current ?? basePos
          const target = Math.max(0, Math.min(durationMsRef.current - 500, base + seekDeltaMs))
          setHorizontalSeekDeltaMs(seekDeltaMs)
          // 屏幕中间显示"目标时间 / 总时间"，让用户知道滑动到了哪里
          setSeekPreviewText(`${msToTimecode(target)} / ${msToTimecode(durationMsRef.current)}`)
          if (playerRef.current) {
            playerRef.current.currentTime = target / 1000
            setPositionMs(target)
          }
        } else if (absDy > 10) {
          // Vertical
          const xRatio = e.x / videoWidth
          if (xRatio < EDGE_ZONE_PCT) {
            // Brightness (up = brighter), relative to start
            const delta = -(e.translationY / brightnessVolumeRangePx)
            const ratio = Math.max(0, Math.min(1, startBrightnessRef.current + delta))
            lastBrightnessRef.current = ratio
            void Brightness.setBrightnessAsync(ratio)
            setBrightnessPct(ratio)
            showOverlay(`亮度 ${Math.round(ratio * 100)}%`, ratio)
          } else if (xRatio > 1 - EDGE_ZONE_PCT) {
            // Volume (up = louder), relative to start
            const delta = -(e.translationY / brightnessVolumeRangePx)
            const ratio = Math.max(0, Math.min(1, startVolumeRatioRef.current + delta))
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
        setSeekPreviewText(null)
        horizontalSeekBaseRef.current = null
        void reportProgressNow()
      })
      .onFinalize(() => {
        setBrightnessPct(null)
        setVolumePct(null)
        setHorizontalSeekDeltaMs(null)
        setSeekPreviewText(null)
        horizontalSeekBaseRef.current = null
      }),
    [videoWidth, showOverlay, reportProgressNow],
  )

  // Stable gesture composition using refs (so gestures don't recreate on state changes)
  const toggleControls = useCallback(() => {
    if (controlsVisibleRef.current) {
      hideControls()
    } else {
      showControls()
    }
  }, [hideControls, showControls])

  const handleDoubleTapEnd = useCallback((e: { x: number }) => {
    const w = isLandscapeRef.current ? SCREEN_H : SCREEN_W
    const xRatio = e.x / w
    if (xRatio < EDGE_ZONE_PCT) {
      seekBy(-prefs.doubleTapBackMs)
    } else if (xRatio > 1 - EDGE_ZONE_PCT) {
      seekBy(prefs.doubleTapForwardMs)
    } else {
      togglePlay()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekBy, togglePlay, prefs.doubleTapBackMs, prefs.doubleTapForwardMs])

  const handleLongPressStart = useCallback((e: { x: number }) => {
    const w = isLandscapeRef.current ? SCREEN_H : SCREEN_W
    const xRatio = e.x / w
    if (xRatio < EDGE_ZONE_PCT) startFastScrub('left')
    else if (xRatio > 1 - EDGE_ZONE_PCT) startFastScrub('right')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startFastScrub])

  const composedGesture = useMemo(() => {
    const tap = Gesture.Tap()
      .numberOfTaps(1)
      .maxDuration(250)
      .runOnJS(true)
      .onEnd(toggleControls)

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(DOUBLE_TAP_MAX_MS)
      .runOnJS(true)
      .onEnd(handleDoubleTapEnd)

    const longPress = Gesture.LongPress()
      .minDuration(LONG_PRESS_MS)
      .runOnJS(true)
      .onStart(handleLongPressStart)
      .onEnd(stopFastScrub)
      .onFinalize(stopFastScrub)

    const pan = panGesture

    return Gesture.Race(Gesture.Exclusive(doubleTap, tap), longPress, pan)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toggleControls, handleDoubleTapEnd, handleLongPressStart, stopFastScrub, panGesture])

  const progressPct = durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0

  const progressBarGesture = useMemo(() =>
    Gesture.Pan()
      .minDistance(0)
      .runOnJS(true)
      .onBegin((e) => {
        // 单击就立即 seek：Pan 手势的 onEnd 在无 onUpdate 时不可靠触发，
        // 把 p_seekTo 移到 onBegin/onUpdate 才能让单击 + 拖拽都生效。
        const width = progressBarWidthRef.current || 1
        const xRatio = Math.max(0, Math.min(1, e.x / width))
        const targetMs = xRatio * durationMs
        setSeeking(true)
        showControls()
        setPositionMs(targetMs)
        p_seekTo(targetMs)
      })
      .onUpdate((e) => {
        const width = progressBarWidthRef.current || 1
        const xRatio = Math.max(0, Math.min(1, e.x / width))
        const targetMs = xRatio * durationMs
        setPositionMs(targetMs)
        p_seekTo(targetMs)
      })
      .onEnd(() => {
        setSeeking(false)
        void reportProgressNow()
      }),
    [durationMs, showControls, reportProgressNow],
  )

  const pt = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0
  const speedLabel = playbackRate === 1.0 ? '1x' : `${playbackRate}x`
  const isVolumeMutedIcon = isMuted || (volumePct !== null && volumePct < 0.01)

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={handleClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.container}>
      <View style={[styles.container, { backgroundColor: '#000' }]}>
        <GestureDetector gesture={composedGesture}>
          <View style={[styles.videoTouch, { width: videoWidth, height: videoHeight }]}>
            {error ? (
              <View style={styles.center}>
                <Icon name="alertCircle" size={48} color="#ff5252" />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.errorBtn} onPress={handleClose}>
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

        {/* Horizontal swipe seek preview (center of screen) */}
        {seekPreviewText !== null && (
          <View pointerEvents="none" style={styles.seekPreviewOverlay}>
            <View style={styles.seekPreviewCard}>
              <Text style={styles.seekPreviewText}>{seekPreviewText}</Text>
            </View>
          </View>
        )}

        {controlsVisible && (
          <Animated.View
            pointerEvents="box-none"
            style={[styles.controlsOverlay, { opacity: controlsOpacity }]}
          >
            <View style={[styles.topBar, { paddingTop: pt + 4 }]}>
              <TouchableOpacity onPress={handleClose} style={styles.topBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="chevronLeft" size={26} color="#fff" />
              </TouchableOpacity>
              <View style={styles.titleWrap}>
                <Text style={styles.title} numberOfLines={1}>{currentItem.Name}</Text>
                {currentItem.SeriesName && (
                  <Text style={styles.seriesName} numberOfLines={1}>
                    {currentItem.SeriesName}
                    {currentItem.IndexNumber != null ? ` · 第 ${currentItem.IndexNumber} 集` : ''}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => { setCastPickerVisible(true); showControls() }} style={styles.topBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="connectedTv" size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={toggleLandscape} style={styles.topBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name={isLandscape ? 'exitFullscreen' : 'fullscreen'} size={22} color="#fff" />
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

                {currentItem.Type === 'Episode' && currentItem.SeriesId ? (
                  <TouchableOpacity onPress={() => void playNextEpisode()} style={styles.btn} disabled={!!error}>
                    <Icon name="skipNext" size={30} color="#fff" />
                  </TouchableOpacity>
                ) : null}

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
        onSelectSpeed={(s) => { setPlaybackRate(s); if (playerRef.current) playerRef.current.playbackRate = s }}
      />

      <CastDeviceListModal
        visible={castPickerVisible}
        onClose={() => setCastPickerVisible(false)}
        onPick={handleCastPick}
      />
      </GestureHandlerRootView>
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
  // 横滑快进预览（中央"目标时间 / 总时间"）
  seekPreviewOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seekPreviewCard: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  seekPreviewText: { color: '#fff', fontSize: 18, fontWeight: '600' },
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