import { useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, Image, TouchableOpacity, StyleSheet, Animated, Dimensions, ScrollView, FlatList, Modal,
} from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useNavidromePlayerStore } from '@/stores/navidromePlayerStore'
import { useTheme } from '@/lib/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLyrics, findCurrentLine } from './useLyrics'
import {
  togglePlay, next, prev, seekTo, getServer,
} from '@/lib/audioController'
import { useImmersive } from '@/lib/immersive'
import { navidromeGetCoverArtUrl, navidromeStar, navidromeUnstar } from '@/lib/api/navidrome'
import Icon from '@/components/Icon'
import NavidromeQueueSheet from './NavidromeQueueSheet'
import type { NavidromeSong, NavidromeServerConfig } from '@/types'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
const COVER_SIZE = SCREEN_W - 64
const SHEET_HEIGHT = SCREEN_H

interface Props {
  visible: boolean
  onClose: () => void
  server: NavidromeServerConfig | null
}

type Panel = 'cover' | 'lyrics' | 'queue'

function formatTime(s: number): string {
  if (!s || s <= 0) return '0:00'
  const total = Math.floor(s)
  const m = Math.floor(total / 60)
  const sec = total % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function NavidromeFullPlayer({ visible, onClose, server }: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  useImmersive(visible)
  const queue = useNavidromePlayerStore((s) => s.queue)
  const currentIndex = useNavidromePlayerStore((s) => s.currentIndex)
  const isPlaying = useNavidromePlayerStore((s) => s.isPlaying)
  const currentTime = useNavidromePlayerStore((s) => s.currentTime)
  const duration = useNavidromePlayerStore((s) => s.duration)
  const playMode = useNavidromePlayerStore((s) => s.playMode)
  const isReady = useNavidromePlayerStore((s) => s.isReady)
  const playbackError = useNavidromePlayerStore((s) => s.playbackError)
  const cyclePlayMode = useNavidromePlayerStore((s) => s.cyclePlayMode)
  const song = queue[currentIndex]
  const setIsScrubbing = useNavidromePlayerStore((s) => s.setIsScrubbing)

  const [panel, setPanel] = useState<Panel>('cover')
  const [queueVisible, setQueueVisible] = useState(false)
  const [starred, setStarred] = useState(false)
  const [trackWidth, setTrackWidth] = useState(0)
  const [scrubPct, setScrubPct] = useState<number | null>(null)

  const lyricsData = useLyrics(server, song ?? null)

  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current
  const panelAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : SCREEN_H,
      useNativeDriver: true,
      damping: 22,
      stiffness: 220,
    }).start()
    if (!visible) setPanel('cover')
  }, [visible])

  useEffect(() => {
    setStarred(!!song?.starred)
  }, [song?.id])

  useEffect(() => {
    Animated.timing(panelAnim, {
      toValue: panel === 'cover' ? 0 : panel === 'lyrics' ? 1 : 2,
      duration: 240,
      useNativeDriver: true,
    }).start()
  }, [panel])

  const cover = server && song ? navidromeGetCoverArtUrl(server, song.coverArt, 600) : undefined
  const coverSmall = server && song ? navidromeGetCoverArtUrl(server, song.coverArt, 160) : undefined

  const swipeGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onEnd((e) => {
      if (e.translationY < -60 && e.velocityY < -0.3) {
        if (panel === 'cover') setPanel('lyrics')
        else if (panel === 'lyrics') setPanel('queue')
      } else if (e.translationY > 60 && e.velocityY > 0.3) {
        if (panel === 'queue') setPanel('lyrics')
        else if (panel === 'lyrics') setPanel('cover')
      }
    })
    .runOnJS(true)

  const scrubTargetRef = useRef(0)

  const seekGesture = useMemo(() => {
    const clampPct = (x: number) => Math.max(0, Math.min(1, x / trackWidth))
    const pan = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .runOnJS(true)
      .onStart(() => {
        setIsScrubbing(true)
        scrubTargetRef.current = useNavidromePlayerStore.getState().currentTime
      })
      .onUpdate((e) => {
        if (trackWidth <= 0 || duration <= 0) return
        const pct = clampPct(e.x)
        scrubTargetRef.current = pct * duration
        setScrubPct(pct)
      })
      .onFinalize(() => {
        if (duration > 0) seekTo(scrubTargetRef.current)
        setIsScrubbing(false)
        setScrubPct(null)
      })
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((e) => {
        if (trackWidth <= 0 || duration <= 0) return
        seekTo(clampPct(e.x) * duration)
      })
    return Gesture.Race(pan, tap)
  }, [trackWidth, duration])

  const ratio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0
  const fillPct = (scrubPct ?? ratio) * 100

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Animated.View style={[styles.container, { backgroundColor: t.bg, transform: [{ translateY: slideAnim }] }]}>
        {!song || queue.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: t.textMuted }}>队列为空</Text>
          </View>
        ) : (
        <GestureHandlerRootView style={{ flex: 1 }}>
          <GestureDetector gesture={swipeGesture}>
            <View style={{ flex: 1 }}>
              <View style={styles.header}>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.headerBtn}>
                  <Icon name="expandMore" size={26} color={t.text} style={{ transform: [{ rotate: '180deg' }] }} />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: t.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {panel === 'lyrics' ? '歌词' : panel === 'queue' ? '队列' : '正在播放'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={async () => {
                    if (!server) return
                    if (starred) {
                      await navidromeUnstar(server, { id: song.id })
                      setStarred(false)
                    } else {
                      await navidromeStar(server, { id: song.id })
                      setStarred(true)
                    }
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={styles.headerBtn}
                >
                  <Icon name={starred ? 'favorite' : 'favoriteBorder'} size={22} color={starred ? t.primary : t.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={{ flex: 1 }}>
                <Animated.View
                  style={{
                    flex: 1,
                    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                    opacity: panelAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                    transform: [{
                      translateY: panelAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, -SCREEN_H * 0.15, -SCREEN_H * 0.3] }),
                    }],
                  }}
                  pointerEvents={panel === 'cover' ? 'auto' : 'none'}
                >
                  <View style={styles.coverArea}>
                    <View style={[styles.coverFrame, { backgroundColor: t.border, shadowColor: '#000' }]}>
                      {cover ? (
                        <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" />
                      ) : (
                        <View style={[styles.cover, { backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }]}>
                          <Icon name="music" size={80} color="#fff" />
                        </View>
                      )}
                    </View>
                    <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>{song.title}</Text>
                    <Text style={[styles.artist, { color: t.textMuted }]} numberOfLines={1}>{song.artist ?? '未知艺术家'}</Text>
                    {song.album ? <Text style={[styles.album, { color: t.textMuted }]} numberOfLines={1}>{song.album}</Text> : null}
                  </View>
                </Animated.View>

                <Animated.View
                  style={{
                    flex: 1, position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                    opacity: panelAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
                    transform: [{
                      translateY: panelAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [SCREEN_H * 0.15, 0, -SCREEN_H * 0.15] }),
                    }],
                  }}
                  pointerEvents={panel === 'lyrics' ? 'auto' : 'none'}
                >
                  <LyricsPanel
                    data={lyricsData}
                    currentTime={currentTime}
                    song={song}
                    onSeek={(sec) => seekTo(sec)}
                    textMuted={t.textMuted}
                    text={t.text}
                    primary={t.primary}
                    border={t.border}
                  />
                </Animated.View>

                <Animated.View
                  style={{
                    flex: 1, position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                    opacity: panelAnim.interpolate({ inputRange: [1, 2], outputRange: [0, 1] }),
                    transform: [{
                      translateY: panelAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [SCREEN_H * 0.3, SCREEN_H * 0.15, 0] }),
                    }],
                  }}
                  pointerEvents={panel === 'queue' ? 'auto' : 'none'}
                >
                  <QueuePanel
                    queue={queue}
                    currentIndex={currentIndex}
                    onPlayAt={(i) => {
                      setPanel('cover')
                    }}
                    text={t.text}
                    textMuted={t.textMuted}
                    primary={t.primary}
                    border={t.border}
                    cardBg={t.card}
                  />
                </Animated.View>
              </View>

              <View style={[styles.controls, { paddingBottom: Math.max(24, insets.bottom) }]}>
                <View style={styles.progressRow}>
                  <Text style={{ color: t.textMuted, fontSize: 11, width: 44 }}>{formatTime(currentTime)}</Text>
                  <GestureDetector gesture={seekGesture}>
                    <View
                      style={styles.seekArea}
                      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
                    >
                      <View style={[styles.progressTrack, { backgroundColor: t.border }]}>
                        <View style={[styles.progressFill, { backgroundColor: t.primary, width: `${fillPct}%` }]} />
                        <View style={[styles.knob, { backgroundColor: t.primary, left: `${fillPct}%` }]} />
                      </View>
                    </View>
                  </GestureDetector>
                  <Text style={{ color: t.textMuted, fontSize: 11, width: 44, textAlign: 'right' }}>{formatTime(duration)}</Text>
                </View>

                <View style={styles.btns}>
                  <TouchableOpacity onPress={cyclePlayMode} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Icon
                      name={playMode === 'shuffle' ? 'shuffle' : playMode === 'single-repeat' ? 'repeatOne' : playMode === 'list' ? 'sortAscending' : 'repeat'}
                      size={22}
                      color={t.text}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={prev} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.ctrlBtn}>
                    <Icon name="skipPrev" size={32} color={t.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={togglePlay}
                    disabled={!isReady}
                    style={[styles.playBtn, { backgroundColor: t.primary }]}
                  >
                    <Icon name={isPlaying ? 'pause' : 'play'} size={32} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={next} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.ctrlBtn}>
                    <Icon name="skipNext" size={32} color={t.text} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setQueueVisible(true)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Icon name="queueMusic" size={22} color={t.text} />
                  </TouchableOpacity>
                </View>

                {playbackError ? (
                  <Text style={{ color: '#e5484d', fontSize: 11, textAlign: 'center', marginTop: 12, paddingHorizontal: 8 }} numberOfLines={2}>
                    {playbackError}
                  </Text>
                ) : null}
              </View>
            </View>
          </GestureDetector>

          <NavidromeQueueSheet visible={queueVisible} onClose={() => setQueueVisible(false)} />
        </GestureHandlerRootView>
        )}
      </Animated.View>
    </Modal>
  )
}

function LyricsPanel({
  data, currentTime, song, onSeek, textMuted, text, primary, border,
}: {
  data: ReturnType<typeof useLyrics>
  currentTime: number
  song: NavidromeSong
  onSeek: (s: number) => void
  textMuted: string
  text: string
  primary: string
  border: string
}) {
  const [lang, setLang] = useState<string | null>(null)
  const [showLangPicker, setShowLangPicker] = useState(false)

  useEffect(() => {
    if (data.structured && data.structured.length > 0) {
      setLang((prev) => prev && data.structured!.some((s) => s.lang === prev) ? prev : (data.structured![0].lang))
    } else {
      setLang(null)
    }
  }, [song.id, data.structured])

  const active = data.structured?.find((s) => s.lang === lang) ?? data.structured?.[0] ?? null
  const offset = active?.offset ?? 0
  const lines = active?.line ?? []
  const synced = active?.synced ?? false
  const currentIdx = synced ? findCurrentLine(lines, currentTime, offset) : -1
  const scrollRef = useRef<ScrollView>(null)
  const lastIdxRef = useRef(-1)

  useEffect(() => {
    if (!synced) return
    if (currentIdx === lastIdxRef.current) return
    lastIdxRef.current = currentIdx
    if (currentIdx < 0) return
    const y = Math.max(0, currentIdx * 36 - 200)
    scrollRef.current?.scrollTo({ y, animated: true })
  }, [currentIdx, synced])

  const renderStructured = () => (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingVertical: 100, paddingHorizontal: 24 }}
      showsVerticalScrollIndicator={false}
    >
      {lines.map((l, i) => (
        <TouchableOpacity key={i} activeOpacity={0.7} onPress={() => onSeek(l.start / 1000)}>
          <Text
            style={{
              fontSize: i === currentIdx ? 18 : 15,
              fontWeight: i === currentIdx ? '700' : '400',
              color: i === currentIdx ? primary : textMuted,
              lineHeight: 36,
              textAlign: 'center',
              marginVertical: 2,
            }}
          >
            {l.value}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )

  const renderPlain = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 60, paddingHorizontal: 24 }}>
      <Text style={{ color: text, fontSize: 14, lineHeight: 24, textAlign: 'center' }}>
        {(data.plain ?? '').trim() || (song.artist ? `${song.artist} - ${song.title}` : song.title)}
      </Text>
    </ScrollView>
  )

  const langs = data.structured?.map((s) => s.lang) ?? []

  return (
    <View style={{ flex: 1 }}>
      {data.loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: textMuted }}>加载歌词中…</Text>
        </View>
      ) : active && synced && lines.length > 0 ? (
        renderStructured()
      ) : data.plain ? (
        renderPlain()
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Text style={{ color: textMuted, fontSize: 14, textAlign: 'center' }}>暂无歌词</Text>
        </View>
      )}

      {langs.length > 1 && (
        <View style={{ position: 'absolute', top: 12, right: 12 }}>
          <TouchableOpacity
            onPress={() => setShowLangPicker((v) => !v)}
            style={{ backgroundColor: border + '55', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}
          >
            <Text style={{ color: text, fontSize: 12 }}>{lang}</Text>
          </TouchableOpacity>
          {showLangPicker && (
            <View style={{ marginTop: 4, backgroundColor: border + '88', borderRadius: 8, padding: 4 }}>
              {langs.map((l) => (
                <TouchableOpacity key={l} onPress={() => { setLang(l); setShowLangPicker(false) }} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ color: l === lang ? primary : text, fontSize: 12 }}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  )
}

function QueuePanel({
  queue, currentIndex, onPlayAt, text, textMuted, primary, border, cardBg,
}: {
  queue: NavidromeSong[]
  currentIndex: number
  onPlayAt: (i: number) => void
  text: string
  textMuted: string
  primary: string
  border: string
  cardBg: string
}) {
  const server = getServer()
  return (
    <FlatList
      data={queue}
      keyExtractor={(item, i) => item.id ?? String(i)}
      contentContainerStyle={{ paddingTop: 60, paddingBottom: 16 }}
      renderItem={({ item, index }) => {
        const isCurrent = index === currentIndex
        const cover = server ? navidromeGetCoverArtUrl(server, item.coverArt, 80) : undefined
        return (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onPlayAt(index)}
            style={{
              flexDirection: 'row', alignItems: 'center',
              paddingVertical: 8, paddingHorizontal: 18,
              backgroundColor: isCurrent ? primary + '22' : 'transparent',
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border,
            }}
          >
            {isCurrent ? (
              <Icon name="music" size={18} color={primary} style={{ width: 24 }} />
            ) : (
              <Text style={{ width: 24, color: textMuted, fontSize: 13, textAlign: 'center' }}>{index + 1}</Text>
            )}
            {cover ? (
              <Image source={{ uri: cover }} style={{ width: 36, height: 36, borderRadius: 4, marginLeft: 6 }} />
            ) : (
              <View style={{ width: 36, height: 36, borderRadius: 4, backgroundColor: primary, marginLeft: 6, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="music" size={14} color="#fff" />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: isCurrent ? primary : text }} numberOfLines={1}>{item.title}</Text>
              <Text style={{ fontSize: 11, color: textMuted, marginTop: 1 }} numberOfLines={1}>{item.artist ?? '未知艺术家'}</Text>
            </View>
          </TouchableOpacity>
        )
      }}
    />
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 36 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 44 },
  headerBtn: { padding: 6, minWidth: 60 },
  coverArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingTop: 8 },
  coverFrame: { width: COVER_SIZE, height: COVER_SIZE, borderRadius: 12, overflow: 'hidden', elevation: 8, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  cover: { width: '100%', height: '100%' },
  title: { fontSize: 22, fontWeight: '700', marginTop: 24, textAlign: 'center', paddingHorizontal: 16 },
  artist: { fontSize: 14, marginTop: 6 },
  album: { fontSize: 13, marginTop: 2 },
  controls: { paddingHorizontal: 16, paddingBottom: 24 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seekArea: { flex: 1, height: 32, justifyContent: 'center' },
  progressTrack: { height: 4, borderRadius: 2 },
  progressFill: { height: '100%', borderRadius: 2 },
  knob: { position: 'absolute', width: 14, height: 14, borderRadius: 7, top: -5, marginLeft: -7 },
  btns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingHorizontal: 4 },
  ctrlBtn: { padding: 4 },
  playBtn: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  volumeTrack: { width: 120, height: 4, borderRadius: 2 }, // unused, kept for future
})