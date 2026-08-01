import { View, Text, Image, TouchableOpacity, Pressable, StyleSheet, Animated } from 'react-native'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useNavidromePlayerStore } from '@/stores/navidromePlayerStore'
import { useTheme } from '@/lib/theme'
import { togglePlay, next, getServer } from '@/lib/audioController'
import { navidromeGetCoverArtUrl } from '@/lib/api/navidrome'
import { useLyrics, findCurrentLine } from './useLyrics'
import Icon from '@/components/Icon'

interface Props {
  onPress: () => void
}

export default function NavidromeMiniPlayer({ onPress }: Props) {
  const t = useTheme()
  const queue = useNavidromePlayerStore((s) => s.queue)
  const currentIndex = useNavidromePlayerStore((s) => s.currentIndex)
  const isPlaying = useNavidromePlayerStore((s) => s.isPlaying)
  const song = queue[currentIndex]

  const progressAnim = useRef(new Animated.Value(0)).current
  const currentTime = useNavidromePlayerStore((s) => s.currentTime)
  const duration = useNavidromePlayerStore((s) => s.duration)

  const server = getServer()
  const lyricsData = useLyrics(server, song ?? null)
  const currentLyric = useMemo(() => {
    if (lyricsData.structured && lyricsData.structured.length > 0) {
      const first = lyricsData.structured[0]
      const lines = first.line
      const synced = first.synced && lines.length > 0 && lines[0].start != null
      if (synced) {
        const idx = findCurrentLine(lines, currentTime, first.offset ?? 0)
        if (idx >= 0) return lines[idx].value ?? ''
        if (currentTime < 0.5) return lines[0]?.value ?? ''
        return ''
      }
      return lines[0]?.value ?? ''
    }
    return (lyricsData.plain ?? '').trim()
  }, [lyricsData, currentTime])

  const handlePlay = useCallback((e: any) => {
    e?.stopPropagation?.()
    togglePlay()
  }, [])

  const handleNext = useCallback((e: any) => {
    e?.stopPropagation?.()
    next()
  }, [])

  useEffect(() => {
    if (!duration || duration <= 0) {
      progressAnim.setValue(0)
      return
    }
    const ratio = Math.min(1, Math.max(0, currentTime / duration))
    Animated.timing(progressAnim, {
      toValue: ratio,
      duration: 250,
      useNativeDriver: false,
    }).start()
  }, [currentTime, duration])

  if (!song) return null

  const cover = server ? navidromeGetCoverArtUrl(server, song.coverArt, 160) : undefined
  const titleLine = song.artist ? `${song.title} - ${song.artist}` : (song.title ?? '')

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: t.border }}
      style={[styles.bar, { backgroundColor: t.card, borderTopColor: t.border }]}
    >
      <View style={styles.coverWrap} pointerEvents="none">
        {cover ? (
          <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" />
        ) : (
          <View style={[styles.cover, { backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }]}>
            <Icon name="music" size={18} color="#fff" />
          </View>
        )}
      </View>
      <View style={{ flex: 1, marginLeft: 10, justifyContent: 'center' }} pointerEvents="none">
        <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{titleLine}</Text>
        <Text style={[styles.lyric, { color: t.textMuted }]} numberOfLines={1}>
          {currentLyric || (song.album ?? '')}
        </Text>
      </View>
      <TouchableOpacity onPress={handlePlay} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.btn}>
        <Icon name={isPlaying ? 'pause' : 'play'} size={28} color={t.text} />
      </TouchableOpacity>
      <TouchableOpacity onPress={handleNext} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.btn}>
        <Icon name="skipNext" size={28} color={t.text} />
      </TouchableOpacity>
      <Animated.View pointerEvents="none" style={[styles.progress, { backgroundColor: t.primary, width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 68,
  },
  coverWrap: { width: 48, height: 48, borderRadius: 4, overflow: 'hidden' },
  cover: { width: 48, height: 48, borderRadius: 4 },
  title: { fontSize: 13, fontWeight: '600' },
  lyric: { fontSize: 11, marginTop: 2 },
  btn: { padding: 8 },
  progress: {
    position: 'absolute', top: 0, left: 0, height: 2,
  },
})