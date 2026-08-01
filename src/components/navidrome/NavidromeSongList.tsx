import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native'
import type { NavidromeSong, NavidromeServerConfig } from '@/types'
import { useTheme } from '@/lib/theme'
import { useNavidromePlaybackStore } from '@/stores/navidromePlaybackStore'
import Icon from '@/components/Icon'

interface Props {
  songs: NavidromeSong[]
  onSongPress: (song: NavidromeSong, index: number) => void
  emptyText?: string
}

function formatDuration(s?: number): string {
  if (!s || s <= 0) return ''
  const total = Math.round(s)
  const m = Math.floor(total / 60)
  const sec = total % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function NavidromeSongList({ songs, onSongPress, emptyText = '暂无歌曲' }: Props) {
  const t = useTheme()
  const showPlayCount = useNavidromePlaybackStore((s) => s.showPlayCount)
  if (songs.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={[styles.empty, { color: t.textMuted }]}>{emptyText}</Text>
      </View>
    )
  }
  return (
    <FlatList
      data={songs}
      scrollEnabled={false}
      keyExtractor={(item, i) => item.id ?? item.title ?? String(i)}
      renderItem={({ item, index }) => (
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: t.border }]}
          activeOpacity={0.7}
          onPress={() => onSongPress(item, index)}
        >
          <View style={styles.trackWrap}>
            {item.track != null ? (
              <Text style={[styles.track, { color: t.textMuted }]}>{item.track.toString().padStart(2, '0')}</Text>
            ) : (
              <Icon name="music" size={14} color={t.textMuted} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{item.title}</Text>
            <Text style={[styles.artist, { color: t.textMuted }]} numberOfLines={1}>{item.artist ?? '未知艺术家'}</Text>
          </View>
          {showPlayCount && item.playCount != null && item.playCount > 0 ? (
            <Text style={[styles.playCount, { color: t.warning }]}>▶ {item.playCount}</Text>
          ) : null}
          <Text style={[styles.duration, { color: t.textMuted }]}>{formatDuration(item.duration)}</Text>
        </TouchableOpacity>
      )}
    />
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  trackWrap: { width: 30, alignItems: 'center' },
  track: { fontSize: 12, fontWeight: '500' },
  title: { fontSize: 14, fontWeight: '500' },
  artist: { fontSize: 11, marginTop: 2 },
  playCount: { fontSize: 11, marginHorizontal: 8 },
  duration: { fontSize: 12, minWidth: 40, textAlign: 'right' },
  emptyWrap: { paddingVertical: 60, alignItems: 'center' },
  empty: { fontSize: 14 },
})