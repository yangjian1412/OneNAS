import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, Modal, PanResponder } from 'react-native'
import { useTheme } from '@/lib/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Icon from '@/components/Icon'
import {
  AudiobookshelfBookMedia,
  AudiobookshelfLibraryItem,
  AudiobookshelfPlaybackSession,
  AudiobookshelfServerConfig,
  AudiobookshelfTrack,
} from '@/types'
import {
  audiobookshelfPlayItem,
  audiobookshelfGetCoverUrl,
  audiobookshelfUpdateProgress,
} from '@/lib/api/audiobookshelf'
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'

interface Props {
  visible: boolean
  server: AudiobookshelfServerConfig
  item: AudiobookshelfLibraryItem
  onClose: () => void
}

export default function AudiobookshelfPlayer({ visible, server, item, onClose }: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()

  const [session, setSession] = useState<AudiobookshelfPlaybackSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [playing, setPlaying] = useState(false)
  const [currentTrackIdx, setCurrentTrackIdx] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [progress, setProgress] = useState(0)

  const lastReportRef = useRef(0)
  const startTimeRef = useRef(0)
  const seekingRef = useRef(false)

  const media = item.media as AudiobookshelfBookMedia
  const tracks: AudiobookshelfTrack[] = session?.audioTracks ?? media.tracks ?? []
  const coverUrl = audiobookshelfGetCoverUrl(server, item.id, 400)
  const titleText = media.metadata.title
  const authorText = media.metadata.authorName || ''

  // Build stream URL for the current track
  const getStreamUri = useCallback((track: AudiobookshelfTrack): string | null => {
    if (!session) return null
    if (track.contentUrl.startsWith('http')) return track.contentUrl
    const base = server.url.replace(/\/$/, '')
    return `${base}${track.contentUrl}${track.contentUrl.includes('?') ? '&' : '?'}token=${server.token}`
  }, [session, server])

  // Initialize audio player for current track
  const currentTrack = tracks[currentTrackIdx] ?? null
  const streamUri = currentTrack ? getStreamUri(currentTrack) : null

  const player = useAudioPlayer(streamUri ? { uri: streamUri, name: currentTrack?.title } : null, {
    keepAudioSessionActive: true,
  })
  const status = useAudioPlayerStatus(player)

  // Enable background playback + lock screen controls
  useEffect(() => {
    setAudioModeAsync({ shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(() => {})
    return () => {
      setAudioModeAsync({ shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' }).catch(() => {})
    }
  }, [])

  // Fetch playback session on open
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      startTimeRef.current = 0
      const result = await audiobookshelfPlayItem(server, item.id)
      if (cancelled) return
      setLoading(false)
      if (result.ok && result.session) {
        setSession(result.session)
        const sessionTracks = result.session.audioTracks ?? []
        const savedAt = item.userMediaProgress?.currentTime
        const startAt = savedAt != null && savedAt > 0 ? savedAt : 0
        // Find which track to start on based on currentTime
        if (startAt > 0 && sessionTracks.length > 0) {
          let idx = 0
          for (let i = 0; i < sessionTracks.length; i++) {
            const startOff = sessionTracks[i].startOffset
            const dur = sessionTracks[i].duration
            if (startAt >= startOff && startAt < startOff + dur) {
              idx = i
              break
            }
            if (startAt >= startOff + dur) idx = i
          }
          setCurrentTrackIdx(idx)
          startTimeRef.current = startAt - (sessionTracks[idx].startOffset ?? 0)
        }
      } else {
        setError(result.error ?? '播放会话获取失败')
      }
    })()
    return () => { cancelled = true }
  }, [visible, item.id, server])

  // Sync UI from live player status
  useEffect(() => {
    const dur = status.duration ?? 0
    const cur = status.currentTime ?? 0
    if (seekingRef.current) return
    setDuration(dur)
    setCurrentTime(cur)
    if (dur > 0) setProgress(cur / dur)
  }, [status.currentTime, status.duration, status.isLoaded])

  // Auto-play once loaded, then seek to resume position (seek AFTER load so it isn't dropped)
  const initialSeekDone = useRef(false)
  useEffect(() => {
    initialSeekDone.current = false
  }, [streamUri])

  useEffect(() => {
    if (!player || !status.isLoaded || initialSeekDone.current) return
    initialSeekDone.current = true
    const startPos = startTimeRef.current > 0 ? startTimeRef.current : 0
    if (startPos > 0) {
      try { player.seekTo(startPos) } catch {}
    }
    try { player.play() } catch {}
    setPlaying(true)
  }, [player, status.isLoaded, streamUri])

  // Auto-advance to next track on finish
  useEffect(() => {
    if (status.didJustFinish && tracks.length > 1) {
      setCurrentTrackIdx((i) => {
        if (i < tracks.length - 1) {
          startTimeRef.current = 0
          return i + 1
        }
        return i
      })
    }
  }, [status.didJustFinish, tracks.length])

  // Lock screen controls
  useEffect(() => {
    if (!player || !streamUri) return
    try {
      player.setActiveForLockScreen(true, {
        title: currentTrack?.title || titleText,
        artist: authorText || 'Audiobookshelf',
        artworkUrl: coverUrl,
      })
    } catch {}
    return () => {
      try { player.setActiveForLockScreen(false) } catch {}
    }
  }, [player, streamUri, currentTrackIdx, titleText, authorText, coverUrl])

  // Progress report (every 10 seconds)
  useEffect(() => {
    if (!session || !playing) return
    if (currentTime - lastReportRef.current < 10) return
    lastReportRef.current = currentTime
    const offset = (currentTrack?.startOffset ?? 0) + currentTime
    audiobookshelfUpdateProgress(server, item.id, undefined, {
      currentTime: offset,
      duration: tracks.reduce((sum, tr) => sum + tr.duration, 0),
      isFinished: false,
    }).catch(() => {})
  }, [currentTime, playing, session, server, item.id, currentTrack, tracks])

  const togglePlay = () => {
    if (!player) return
    if (playing) {
      player.pause()
      setPlaying(false)
    } else {
      player.play()
      setPlaying(true)
    }
  }

  const seekTo = (sec: number) => {
    if (!player) return
    player.seekTo(sec)
    setCurrentTime(sec)
    if (duration > 0) setProgress(sec / duration)
  }

  const skipPrev = () => {
    if (!tracks.length) return
    if (currentTime > 3) {
      seekTo(0)
      return
    }
    const prev = Math.max(0, currentTrackIdx - 1)
    setCurrentTrackIdx(prev)
    startTimeRef.current = 0
    seekTo(0)
  }

  const skipNext = () => {
    if (!tracks.length) return
    const next = Math.min(tracks.length - 1, currentTrackIdx + 1)
    setCurrentTrackIdx(next)
    startTimeRef.current = 0
    seekTo(0)
  }

  const handleClose = () => {
    // Final progress report
    if (session && duration > 0) {
      const offset = (currentTrack?.startOffset ?? 0) + currentTime
      const total = tracks.reduce((sum, tr) => sum + tr.duration, 0)
      audiobookshelfUpdateProgress(server, item.id, undefined, {
        currentTime: offset,
        duration: total,
        isFinished: progress >= 0.95,
      }).catch(() => {})
    }
    try { player?.pause() } catch {}
    setPlaying(false)
    onClose()
  }

  // ===== Draggable progress bar =====
  const progressWrapRef = useRef<View>(null)
  const barLeft = useRef(0)
  const barWidth = useRef(0)
  const seekFn = useRef<(pageX: number, doSeek: boolean) => void>(() => {})

  seekFn.current = (pageX: number, doSeek: boolean) => {
    if (!duration || !barWidth.current) return
    const ratio = Math.max(0, Math.min(1, (pageX - barLeft.current) / barWidth.current))
    const target = ratio * duration
    setProgress(ratio)
    setCurrentTime(target)
    if (doSeek) {
      seekingRef.current = true
      player.seekTo(target)
      // Allow the status poll to resume updating shortly after
      setTimeout(() => { seekingRef.current = false }, 1000)
    }
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => { seekFn.current(evt.nativeEvent.pageX, false) },
      onPanResponderMove: (evt) => { seekFn.current(evt.nativeEvent.pageX, false) },
      onPanResponderRelease: (evt) => { seekFn.current(evt.nativeEvent.pageX, true) },
    })
  ).current

  if (!visible) return null

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View style={[styles.full, { backgroundColor: t.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Icon name="chevronDown" size={26} color={t.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={t.primary} size="large" />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Icon name="alertCircle" size={48} color="#ff6b6b" />
            <Text style={[styles.errorText, { color: t.text }]}>{error}</Text>
            <TouchableOpacity style={[styles.retry, { backgroundColor: t.primary }]} onPress={() => {
              setError(null)
              setSession(null)
            }}>
              <Text style={styles.retryText}>重试</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.content}>
            <View style={styles.coverWrap}>
              <CoverImage uri={coverUrl} />
            </View>
            <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>
              {titleText}
            </Text>
            <Text style={[styles.author, { color: t.textMuted }]} numberOfLines={1}>
              {authorText}
            </Text>
            {tracks.length > 1 && (
              <Text style={[styles.track, { color: t.textMuted }]}>
                第 {currentTrackIdx + 1} / {tracks.length} 段
              </Text>
            )}

            <View style={styles.progressRow}>
              <View
                ref={progressWrapRef}
                style={styles.progressWrap}
                onLayout={() => {
                  const el = progressWrapRef.current
                  if (el && el.measureInWindow) {
                    el.measureInWindow((x: number, _y: number, w: number) => {
                      barLeft.current = x
                      barWidth.current = w
                    })
                  }
                }}
                {...panResponder.panHandlers}
              >
                <View style={[styles.progressTrack, { backgroundColor: t.border }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.max(0, Math.min(1, progress)) * 100}%`, backgroundColor: t.primary },
                    ]}
                  />
                  <View
                    style={[
                      styles.progressThumb,
                      {
                        left: `${Math.max(0, Math.min(1, progress)) * 100}%`,
                        backgroundColor: t.primary,
                        borderColor: t.bg,
                      },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.timeRow}>
                <Text style={[styles.time, { color: t.textMuted }]}>{formatTime(currentTime)}</Text>
                <Text style={[styles.time, { color: t.textMuted }]}>{formatTime(duration)}</Text>
              </View>
            </View>

            <View style={styles.controls}>
              <TouchableOpacity onPress={skipPrev} style={styles.ctrlBtn}>
                <Icon name="skipPrev" size={32} color={t.text} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={togglePlay}
                style={[styles.playBtn, { backgroundColor: t.primary }]}
              >
                <Icon name={playing ? 'pause' : 'play'} size={36} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={skipNext} style={styles.ctrlBtn}>
                <Icon name="skipNext" size={32} color={t.text} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  )
}

function CoverImage({ uri }: { uri: string }) {
  const { Image } = require('react-native')
  return <Image source={{ uri }} style={styles.cover} resizeMode="cover" />
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

const styles = {
  full: { flex: 1 as const },
  headerBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeBtn: { width: 40, height: 40, justifyContent: 'center' as const, alignItems: 'center' as const },
  center: { flex: 1 as const, justifyContent: 'center' as const, alignItems: 'center' as const, padding: 24 },
  errorText: { fontSize: 14, marginTop: 12, textAlign: 'center' as const },
  retry: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8, marginTop: 16 },
  retryText: { color: '#fff', fontWeight: '600' as const },
  content: {
    flex: 1 as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 24,
    gap: 12,
  },
  coverWrap: {
    width: 240,
    height: 240,
    borderRadius: 12,
    overflow: 'hidden' as const,
    backgroundColor: '#888',
  },
  cover: { width: '100%' as const, height: '100%' as const },
  title: { fontSize: 20, fontWeight: '700' as const, textAlign: 'center' as const },
  author: { fontSize: 14 },
  track: { fontSize: 12 },
  progressRow: { width: '100%' as const, marginTop: 16 },
  progressWrap: { width: '100%' as const, paddingVertical: 12, marginTop: 4 },
  progressTrack: { height: 4, borderRadius: 2, justifyContent: 'center' as const },
  progressFill: { height: '100%' as const, borderRadius: 2 },
  progressThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    position: 'absolute' as const,
    marginLeft: -7,
    borderWidth: 3,
  },
  timeRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginTop: 6 },
  time: { fontSize: 12 },
  controls: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 24,
    marginTop: 24,
  },
  ctrlBtn: { padding: 8 },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
}
