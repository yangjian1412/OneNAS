import { useEffect, useRef, useState, useCallback } from 'react'
import { View, Text, Image, TouchableOpacity, ScrollView, StyleSheet, Dimensions } from 'react-native'
import { useAudioPlayer } from 'expo-audio'
import type { NavidromeSong, NavidromeServerConfig, NavidromePreferences, NavidromeStructuredLyrics, NavidromeLyricsLine } from '@/types'
import { navidromeGetStreamUrl, navidromeScrobble, navidromeGetLyricsBySongId } from '@/lib/api/navidrome'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'

const SCR_W = Dimensions.get('window').width

interface NavidromePlayerBarProps {
  visible: boolean
  songs: NavidromeSong[]
  index: number
  server: NavidromeServerConfig
  onClose: () => void
  onAdvance: () => void
}

export function NavidromePlayerBar({ visible, songs, index, onClose, onAdvance }: NavidromePlayerBarProps) {
  const t = useTheme()
  const song = songs[index]
  if (!visible || !song) return null

  return (
    <View style={[styles.bar, { backgroundColor: t.card, borderTopColor: t.border }]}>
      <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={onAdvance}>
        <View style={[styles.iconWrap, { backgroundColor: t.primary }]}>
          <Icon name="playCircle" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{song.title}</Text>
          <Text style={[styles.artist, { color: t.textMuted }]} numberOfLines={1}>{song.artist ?? '未知艺术家'}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.closeBtn}>
        <Icon name="x" size={20} color={t.textMuted} />
      </TouchableOpacity>
    </View>
  )
}

interface NavidromePlayerProps {
  visible: boolean
  songs: NavidromeSong[]
  startIndex: number
  server: NavidromeServerConfig
  preferences: NavidromePreferences
  onClose: () => void
}

export default function NavidromePlayer({ visible, songs, startIndex, server, preferences, onClose }: NavidromePlayerProps) {
  if (!visible || songs.length === 0) return null
  const [index, setIndex] = useState(startIndex)
  const song = songs[index]
  if (!song) return null

  return (
    <NavidromeInlinePlayer
      song={song}
      songs={songs}
      index={index}
      setIndex={setIndex}
      streamUrl={navidromeGetStreamUrl(server, song.id)}
      onClose={onClose}
      onScrobble={() => navidromeScrobble(server, song.id)}
      server={server}
      preferences={preferences}
    />
  )
}

function NavidromeInlinePlayer({
  song,
  songs,
  index,
  setIndex,
  streamUrl,
  onClose,
  onScrobble,
  server,
  preferences,
}: {
  song: NavidromeSong
  songs: NavidromeSong[]
  index: number
  setIndex: (i: number) => void
  streamUrl: string
  onClose: () => void
  onScrobble: () => void
  server: NavidromeServerConfig
  preferences: NavidromePreferences
}) {
  const t = useTheme()
  const player = useAudioPlayer(streamUrl)
  const scrobbledRef = useRef(false)
  const [showInlineLyrics, setShowInlineLyrics] = useState(true)
  const [lyrics, setLyrics] = useState<NavidromeLyricsLine[] | null>(null)
  const [currentLine, setCurrentLine] = useState(-1)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    scrobbledRef.current = false
    setLyrics(null)
    setCurrentLine(-1)
    if (song.id) {
      navidromeGetLyricsBySongId(server, song.id).then((r) => {
        if (r.ok && r.lyrics && r.lyrics.length > 0) {
          const synced = r.lyrics.find((l) => l.synced) ?? r.lyrics[0]
          setLyrics(synced.line ?? [])
        } else {
          setLyrics([])
        }
      })
    }
  }, [streamUrl, song.id])

  useEffect(() => {
    if (player.playing && !scrobbledRef.current) {
      scrobbledRef.current = true
      onScrobble()
    }
  }, [player.playing])

  useEffect(() => {
    if (!player.playing || !lyrics || lyrics.length === 0 || !lyrics[0]?.start) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      return
    }
    const tick = () => {
      const pos = player.currentTime ?? 0
      let line = -1
      for (let i = lyrics.length - 1; i >= 0; i--) {
        if (pos >= lyrics[i].start / 1000) { line = i; break }
      }
      setCurrentLine(line)
    }
    tick()
    intervalRef.current = setInterval(tick, 200)
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null } }
  }, [player.playing, lyrics, player.currentTime])

  const goNext = () => {
    if (index < songs.length - 1) setIndex(index + 1)
  }
  const goPrev = () => {
    if (index > 0) setIndex(index - 1)
  }

  return (
    <View style={[styles.modal, { backgroundColor: t.bg }]}>
      <TouchableOpacity style={styles.closeArea} onPress={onClose}>
        <Icon name="x" size={24} color={t.text} />
      </TouchableOpacity>

      <View style={styles.coverArea}>
        <Image
          source={{ uri: buildCoverArtUrl(server, song.coverArt ?? song.albumId) }}
          style={styles.cover}
          resizeMode="cover"
        />
      </View>

      <Text style={[styles.bigTitle, { color: t.text }]} numberOfLines={2}>{song.title}</Text>
      <Text style={[styles.bigArtist, { color: t.textMuted }]} numberOfLines={1}>{song.artist}</Text>
      <Text style={[styles.bigAlbum, { color: t.textMuted }]} numberOfLines={1}>{song.album}</Text>

      {showInlineLyrics && (
        <ScrollView style={styles.lyricsWrap} contentContainerStyle={styles.lyricsContent}>
          {lyrics === null ? (
            <Text style={[styles.lyrics, { color: t.textMuted }]}>加载歌词中...</Text>
          ) : lyrics.length === 0 ? (
            <Text style={[styles.lyrics, { color: t.textMuted }]}>暂未提供歌词</Text>
          ) : lyrics[0].start != null ? (
            lyrics.map((l, i) => (
              <Text
                key={i}
                style={[
                  styles.lyrics,
                  { color: i === currentLine ? t.primary : t.textMuted, fontWeight: i === currentLine ? '700' : '400', fontSize: i === currentLine ? 16 : 14 },
                ]}
              >
                {l.value}
              </Text>
            ))
          ) : (
            lyrics.map((l, i) => (
              <Text key={i} style={[styles.lyrics, { color: t.textMuted }]}>{l.value}</Text>
            ))
          )}
        </ScrollView>
      )}

      <View style={styles.controls}>
        <TouchableOpacity onPress={goPrev} style={styles.controlBtn}>
          <Icon name="skipPrev" size={28} color={t.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => (player.playing ? player.pause() : player.play())}
          style={[styles.playBtn, { backgroundColor: t.primary }]}
        >
          <Icon name={player.playing ? 'pause' : 'playCircle'} size={32} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={goNext} style={styles.controlBtn}>
          <Icon name="skipNext" size={28} color={t.text} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.lyricToggle, { backgroundColor: showInlineLyrics ? t.primary : t.card }]}
        onPress={() => setShowInlineLyrics(!showInlineLyrics)}
      >
        <Icon name="music" size={18} color={showInlineLyrics ? '#fff' : t.text} />
      </TouchableOpacity>
    </View>
  )
}

function buildCoverArtUrl(server: NavidromeServerConfig, id: string | undefined): string | undefined {
  if (!id) return undefined
  const base = server.url.replace(/\/+$/, '')
  const params = new URLSearchParams()
  params.set('u', server.username)
  if (server.authToken && server.salt) {
    params.set('t', server.authToken)
    params.set('s', server.salt)
  } else {
    params.set('p', server.password)
  }
  params.set('v', '1.16.1')
  params.set('c', 'One NAS')
  params.set('f', 'json')
  params.set('id', id)
  params.set('size', '600')
  return `${base}/rest/getCoverArt?${params.toString()}`
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 14, fontWeight: '600' },
  artist: { fontSize: 11, marginTop: 1 },
  closeBtn: { padding: 6 },
  modal: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 9999,
    paddingTop: 40,
    alignItems: 'center',
  },
  closeArea: { position: 'absolute', top: 16, left: 16, padding: 8, zIndex: 1 },
  coverArea: { width: SCR_W - 64, height: SCR_W - 64, marginVertical: 24 },
  cover: { width: '100%', height: '100%', borderRadius: 12 },
  bigTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center', paddingHorizontal: 24 },
  bigArtist: { fontSize: 14, marginTop: 6 },
  bigAlbum: { fontSize: 13 },
  lyricsWrap: { flex: 1, paddingHorizontal: 24, marginVertical: 16, alignSelf: 'stretch' },
  lyricsContent: { flexGrow: 1, justifyContent: 'center' },
  lyrics: { fontSize: 14, textAlign: 'center', lineHeight: 24 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 24, marginVertical: 24 },
  controlBtn: { padding: 12 },
  playBtn: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  lyricToggle: {
    position: 'absolute', top: 16, right: 16,
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
})