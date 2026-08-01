import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, Modal, PanResponder, ScrollView, Alert, StyleSheet } from 'react-native'
import { useTheme } from '@/lib/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Icon from '@/components/Icon'
import {
  AudiobookshelfBookMedia,
  AudiobookshelfBookmark,
  AudiobookshelfLibraryItem,
  AudiobookshelfPlaybackSession,
  AudiobookshelfServerConfig,
  AudiobookshelfTrack,
} from '@/types'
import {
  audiobookshelfPlayItem,
  audiobookshelfGetCoverUrl,
  audiobookshelfUpdateProgress,
  audiobookshelfGetBookmarks,
  audiobookshelfCreateBookmark,
  audiobookshelfDeleteBookmark,
} from '@/lib/api/audiobookshelf'
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { useAudiobookshelfPlaybackStore } from '@/stores/audiobookshelfPlaybackStore'

interface Props {
  visible: boolean
  server: AudiobookshelfServerConfig
  item: AudiobookshelfLibraryItem
  onClose: () => void
}

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]
const SLEEP_OPTIONS = [5, 10, 15, 20, 30, 45, 60]

export default function AudiobookshelfPlayer({ visible, server, item, onClose }: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const prefs = useAudiobookshelfPlaybackStore()

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

  // sheets
  const [speedSheetVisible, setSpeedSheetVisible] = useState(false)
  const [sleepSheetVisible, setSleepSheetVisible] = useState(false)
  const [bookmarkSheetVisible, setBookmarkSheetVisible] = useState(false)
  const [playlistSheetVisible, setPlaylistSheetVisible] = useState(false)
  const [bookmarks, setBookmarks] = useState<AudiobookshelfBookmark[]>([])
  const [sleepRemaining, setSleepRemaining] = useState(0)

  const media = item.media as AudiobookshelfBookMedia
  const tracks: AudiobookshelfTrack[] = session?.audioTracks ?? media.tracks ?? []
  const coverUrl = audiobookshelfGetCoverUrl(server, item.id, 400)
  const titleText = media.metadata.title
  const authorText = media.metadata.authorName || ''
  const totalDuration = tracks.reduce((sum, tr) => sum + (tr.duration || 0), 0)
  const currentTrack = tracks[currentTrackIdx] ?? null
  const bookPosition = (currentTrack?.startOffset ?? 0) + currentTime

  // Build stream URL for the current track
  const getStreamUri = useCallback((track: AudiobookshelfTrack): string | null => {
    if (!session) return null
    if (track.contentUrl.startsWith('http')) return track.contentUrl
    const base = server.url.replace(/\/$/, '')
    return `${base}${track.contentUrl}${track.contentUrl.includes('?') ? '&' : '?'}token=${server.token}`
  }, [session, server])

  // Initialize audio player for current track
  const streamUri = currentTrack ? getStreamUri(currentTrack) : null

  const player = useAudioPlayer(streamUri ? { uri: streamUri, name: currentTrack?.title } : null, {
    keepAudioSessionActive: true,
  })
  const status = useAudioPlayerStatus(player)

  // Enable background playback + lock screen controls
  useEffect(() => {
    setAudioModeAsync({
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
      playsInSilentMode: true,
    }).catch(() => {})
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
      setBookmarks([])
      const result = await audiobookshelfPlayItem(server, item.id)
      if (cancelled) return
      setLoading(false)
      if (result.ok && result.session) {
        setSession(result.session)
        const sessionTracks = result.session.audioTracks ?? []
        const savedAt = item.userMediaProgress?.currentTime
        const startAt = savedAt != null && savedAt > 0 ? savedAt : 0
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
    try { player.playbackRate = prefs.defaultSpeed } catch {}
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
      duration: totalDuration,
      isFinished: false,
    }).catch(() => {})
  }, [currentTime, playing, session, server, item.id, currentTrack, tracks, totalDuration])

  // Sleep timer countdown
  useEffect(() => {
    if (!prefs.sleepEnabled || prefs.sleepMinutes <= 0) {
      setSleepRemaining(0)
      return
    }
    const endTimeRef = { end: Date.now() + prefs.sleepMinutes * 60000 }
    const interval = setInterval(() => {
      const remain = endTimeRef.end - Date.now()
      if (remain <= 0) {
        clearInterval(interval)
        setSleepRemaining(0)
        stopPlayback()
      } else {
        setSleepRemaining(remain)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [prefs.sleepEnabled, prefs.sleepMinutes])

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

  const seekToBookTime = (sec: number) => {
    if (!tracks.length) return
    let target = Math.max(0, sec)
    let idx = 0
    for (let i = 0; i < tracks.length; i++) {
      const s = tracks[i].startOffset
      const d = tracks[i].duration
      if (target >= s && target < s + d) { idx = i; break }
      if (target >= s + d) idx = i
    }
    const within = target - (tracks[idx].startOffset ?? 0)
    if (idx !== currentTrackIdx) {
      setCurrentTrackIdx(idx)
      startTimeRef.current = within
    } else {
      seekTo(within)
    }
  }

  const skipBy = (sec: number) => {
    if (!player || !currentTrack) return
    let target = currentTime + sec
    let idx = currentTrackIdx
    while (target < 0 && idx > 0) {
      idx -= 1
      target += tracks[idx].duration
    }
    while (target >= tracks[idx].duration && idx < tracks.length - 1) {
      target -= tracks[idx].duration
      idx += 1
    }
    target = Math.max(0, Math.min(target, tracks[idx].duration))
    if (idx !== currentTrackIdx) {
      setCurrentTrackIdx(idx)
      startTimeRef.current = target
    } else {
      seekTo(target)
    }
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
  }

  const skipNext = () => {
    if (!tracks.length) return
    const next = Math.min(tracks.length - 1, currentTrackIdx + 1)
    setCurrentTrackIdx(next)
    startTimeRef.current = 0
  }

  const reportProgress = (finished: boolean) => {
    if (session && duration > 0) {
      const offset = (currentTrack?.startOffset ?? 0) + currentTime
      audiobookshelfUpdateProgress(server, item.id, undefined, {
        currentTime: offset,
        duration: totalDuration,
        isFinished: finished || progress >= 0.95,
      }).catch(() => {})
    }
  }

  const handleClose = () => {
    reportProgress(false)
    try { player?.pause() } catch {}
    setPlaying(false)
    setSleepSheetVisible(false)
    setSpeedSheetVisible(false)
    setBookmarkSheetVisible(false)
    setPlaylistSheetVisible(false)
    onClose()
  }

  const stopPlayback = () => {
    reportProgress(false)
    try { player?.pause() } catch {}
    setPlaying(false)
    setSleepSheetVisible(false)
    onClose()
  }

  // Sleep timer controls
  const setSleepTimer = (minutes: number) => {
    if (minutes <= 0) {
      prefs.setSleepEnabled(false)
      prefs.setSleepMinutes(0)
    } else {
      prefs.setSleepMinutes(minutes)
      prefs.setSleepEnabled(true)
    }
    setSleepSheetVisible(false)
  }

  // Bookmark controls
  const loadBookmarks = useCallback(async () => {
    const res = await audiobookshelfGetBookmarks(server, item.id)
    if (res.ok) setBookmarks(res.bookmarks ?? [])
  }, [server, item.id])

  useEffect(() => {
    if (bookmarkSheetVisible) void loadBookmarks()
  }, [bookmarkSheetVisible, loadBookmarks])

  const addBookmark = async () => {
    const time = Math.floor(bookPosition)
    const res = await audiobookshelfCreateBookmark(server, item.id, time, titleText)
    if (res.ok) {
      await loadBookmarks()
    } else {
      Alert.alert('添加书签失败', res.error ?? '未知错误')
    }
  }

  const removeBookmark = async (time: number) => {
    const res = await audiobookshelfDeleteBookmark(server, item.id, time)
    if (res.ok) await loadBookmarks()
  }

  // ===== Draggable progress bar (current track) =====
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

  const bookProgressRatio = totalDuration > 0 ? Math.min(1, Math.max(0, bookPosition / totalDuration)) : 0
  const sleepLabel = sleepRemaining > 0 ? formatCountdown(sleepRemaining) : ''

  if (!visible) return null

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View style={[styles.full, { backgroundColor: t.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Icon name="chevronDown" size={26} color={t.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => setBookmarkSheetVisible(true)} style={styles.closeBtn}>
            <Icon name="bookmark" size={24} color={t.text} />
          </TouchableOpacity>
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
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            <View style={styles.coverWrap}>
              <CoverImage uri={coverUrl} />
            </View>
            <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>
              {titleText}
            </Text>
            <Text style={[styles.author, { color: t.textMuted }]} numberOfLines={1}>
              {authorText}
            </Text>

            {/* Row 1: whole book progress (display only) */}
            <View style={styles.progressRow}>
              <View style={[styles.progressTrack, { backgroundColor: t.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${bookProgressRatio * 100}%`, backgroundColor: t.textMuted },
                  ]}
                />
              </View>
              <View style={styles.timeRow}>
                <Text style={[styles.time, { color: t.textMuted }]}>{formatTime(bookPosition)}</Text>
                <Text style={[styles.time, { color: t.textMuted }]}>{formatTime(totalDuration)}</Text>
              </View>
            </View>

            {/* Row 2: current track progress (draggable) */}
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

            {tracks.length > 1 && (
              <Text style={[styles.track, { color: t.textMuted }]}>
                第 {currentTrackIdx + 1} / {tracks.length} 段
              </Text>
            )}

            {/* Five controls */}
            <View style={styles.controls}>
              <TouchableOpacity onPress={skipPrev} style={styles.ctrlBtn}>
                <Icon name="skipPrev" size={30} color={t.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => skipBy(-prefs.skipBackSec)} style={styles.ctrlBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <View style={styles.skipLabelWrap}>
                  <Icon name="fastRewind" size={30} color={t.text} />
                  <Text style={[styles.skipSec, { color: t.textMuted }]}>{prefs.skipBackSec}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={togglePlay}
                style={[styles.playBtn, { backgroundColor: t.primary }]}
              >
                <Icon name={playing ? 'pause' : 'play'} size={36} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => skipBy(prefs.skipForwardSec)} style={styles.ctrlBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <View style={styles.skipLabelWrap}>
                  <Icon name="fastForward" size={30} color={t.text} />
                  <Text style={[styles.skipSec, { color: t.textMuted }]}>{prefs.skipForwardSec}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={skipNext} style={styles.ctrlBtn}>
                <Icon name="skipNext" size={30} color={t.text} />
              </TouchableOpacity>
            </View>

            {/* Function row: sleep / speed / add bookmark / playlist */}
            <View style={styles.funcRow}>
              <TouchableOpacity
                style={[styles.funcBtn, prefs.sleepEnabled && { backgroundColor: t.primary + '22' }]}
                onPress={() => setSleepSheetVisible(true)}
              >
                <Icon name={prefs.sleepEnabled ? 'sleep' : 'sleepOff'} size={22} color={prefs.sleepEnabled ? t.primary : t.text} />
                <Text style={[styles.funcLabel, { color: prefs.sleepEnabled ? t.primary : t.textMuted }]}>
                  {sleepLabel || '睡眠'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.funcBtn} onPress={() => setSpeedSheetVisible(true)}>
                <Text style={[styles.speedText, { color: status.playbackRate !== 1 ? t.primary : t.text }]}>
                  {`${formatSpeed(status.playbackRate || prefs.defaultSpeed)}x`}
                </Text>
                <Text style={[styles.funcLabel, { color: t.textMuted }]}>倍速</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.funcBtn} onPress={addBookmark}>
                <Icon name="bookmarkAdd" size={22} color={t.text} />
                <Text style={[styles.funcLabel, { color: t.textMuted }]}>书签</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.funcBtn} onPress={() => setPlaylistSheetVisible(true)}>
                <Icon name="queueMusic" size={22} color={t.text} />
                <Text style={[styles.funcLabel, { color: t.textMuted }]}>列表</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>

      {/* Speed sheet */}
      <Sheet visible={speedSheetVisible} title="播放速度" onClose={() => setSpeedSheetVisible(false)}>
        {SPEEDS.map((s) => {
          const selected = Math.abs((status.playbackRate || prefs.defaultSpeed) - s) < 0.01
          return (
            <TouchableOpacity
              key={s}
              style={[styles.sheetRow, { borderBottomColor: t.border }]}
              activeOpacity={0.7}
              onPress={() => {
                try { if (player) player.playbackRate = s } catch {}
                prefs.setDefaultSpeed(s)
                setSpeedSheetVisible(false)
              }}
            >
              <Text style={[styles.sheetLabel, { color: selected ? t.primary : t.text }]}>{`${s}x`}</Text>
              {selected ? <Icon name="multiSelect" size={20} color={t.primary} /> : null}
            </TouchableOpacity>
          )
        })}
      </Sheet>

      {/* Sleep sheet */}
      <Sheet visible={sleepSheetVisible} title="睡眠定时" onClose={() => setSleepSheetVisible(false)}>
        {prefs.sleepEnabled && (
          <TouchableOpacity
            style={[styles.sheetRow, { borderBottomColor: t.border }]}
            activeOpacity={0.7}
            onPress={() => setSleepTimer(0)}
          >
            <Text style={[styles.sheetLabel, { color: '#ff6b6b' }]}>关闭睡眠定时</Text>
          </TouchableOpacity>
        )}
        {SLEEP_OPTIONS.map((m) => {
          const selected = prefs.sleepEnabled && prefs.sleepMinutes === m
          return (
            <TouchableOpacity
              key={m}
              style={[styles.sheetRow, { borderBottomColor: t.border }]}
              activeOpacity={0.7}
              onPress={() => setSleepTimer(m)}
            >
              <Text style={[styles.sheetLabel, { color: selected ? t.primary : t.text }]}>{m} 分钟</Text>
              {selected ? <Icon name="multiSelect" size={20} color={t.primary} /> : null}
            </TouchableOpacity>
          )
        })}
      </Sheet>

      {/* Bookmark sheet */}
      <Sheet visible={bookmarkSheetVisible} title="书签" onClose={() => setBookmarkSheetVisible(false)}>
        <TouchableOpacity
          style={[styles.sheetRow, { borderBottomColor: t.border }]}
          activeOpacity={0.7}
          onPress={async () => {
            await addBookmark()
          }}
        >
          <Text style={[styles.sheetLabel, { color: t.primary }]}>
            添加当前位置书签 · {formatTime(bookPosition)}
          </Text>
        </TouchableOpacity>
        {bookmarks.length === 0 && (
          <Text style={[styles.sheetEmpty, { color: t.textMuted }]}>暂无书签</Text>
        )}
        {bookmarks.map((b) => (
          <TouchableOpacity
            key={b.time}
            style={[styles.sheetRow, { borderBottomColor: t.border }]}
            activeOpacity={0.7}
            onPress={() => { seekToBookTime(b.time); setBookmarkSheetVisible(false) }}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetLabel, { color: t.text }]}>{formatTime(b.time)}</Text>
              {!!b.title && b.title !== titleText && (
                <Text style={[styles.sheetSub, { color: t.textMuted }]} numberOfLines={1}>{b.title}</Text>
              )}
            </View>
            <TouchableOpacity onPress={() => removeBookmark(b.time)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
              <Icon name="x" size={16} color="#ff6b6b" />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </Sheet>

      {/* Playlist sheet */}
      <Sheet visible={playlistSheetVisible} title="播放列表" onClose={() => setPlaylistSheetVisible(false)}>
        {tracks.map((tr, i) => (
          <TouchableOpacity
            key={tr.index}
            style={[styles.sheetRow, { borderBottomColor: t.border }]}
            activeOpacity={0.7}
            onPress={() => {
              if (i !== currentTrackIdx) {
                setCurrentTrackIdx(i)
                startTimeRef.current = 0
              } else {
                seekTo(0)
              }
              setPlaylistSheetVisible(false)
            }}
          >
            <Text style={[styles.sheetIndex, { color: i === currentTrackIdx ? t.primary : t.textMuted }]}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.sheetLabel, { color: i === currentTrackIdx ? t.primary : t.text }]}
                numberOfLines={1}
              >
                {tr.title || `第 ${i + 1} 段`}
              </Text>
            </View>
            <Text style={[styles.sheetSub, { color: t.textMuted }]}>{formatTime(tr.duration)}</Text>
          </TouchableOpacity>
        ))}
      </Sheet>
    </Modal>
  )
}

function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={onClose}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: t.card, paddingBottom: insets.bottom + 16 },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: t.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="x" size={22} color={t.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.sheetList}>{children}</ScrollView>
        </View>
      </TouchableOpacity>
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

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatSpeed(rate: number): string {
  if (Math.abs(rate - Math.round(rate)) < 0.01) return String(Math.round(rate))
  return rate.toFixed(2).replace(/\.?0+$/, '')
}

const styles = StyleSheet.create({
  full: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 14, marginTop: 12, textAlign: 'center' },
  retry: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8, marginTop: 16 },
  retryText: { color: '#fff', fontWeight: '600' },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 12,
  },
  coverWrap: {
    width: 200,
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#888',
  },
  cover: { width: '100%', height: '100%' },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  author: { fontSize: 14 },
  track: { fontSize: 12 },
  progressRow: { width: '100%', marginTop: 4 },
  progressWrap: { width: '100%', paddingVertical: 12, marginTop: 4 },
  progressTrack: { height: 4, borderRadius: 2, justifyContent: 'center' },
  progressFill: { height: '100%', borderRadius: 2 },
  progressThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    position: 'absolute',
    marginLeft: -7,
    borderWidth: 3,
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  time: { fontSize: 12 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginTop: 16,
  },
  ctrlBtn: { padding: 6 },
  skipLabelWrap: { alignItems: 'center' },
  skipSec: { fontSize: 9, marginTop: -2 },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  funcRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
    paddingHorizontal: 8,
  },
  funcBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    minWidth: 56,
  },
  funcLabel: { fontSize: 11, marginTop: 4 },
  speedText: { fontSize: 19, fontWeight: '700', height: 24 },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    maxHeight: 480,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#888', alignSelf: 'center', marginBottom: 8 },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700' },
  sheetList: { paddingHorizontal: 8 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  sheetLabel: { fontSize: 16, fontWeight: '500' },
  sheetSub: { fontSize: 13, marginTop: 2 },
  sheetIndex: { fontSize: 14, fontWeight: '600', width: 24 },
  sheetEmpty: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
})
