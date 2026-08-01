import { View, Text, TouchableOpacity, FlatList, StyleSheet, Dimensions } from 'react-native'
import type { NavidromeAlbum, NavidromeArtist, NavidromePlaylist, NavidromeServerConfig } from '@/types'
import { useTheme } from '@/lib/theme'
import { useNavidromePlaybackStore } from '@/stores/navidromePlaybackStore'
import NavidromeCoverArt from './NavidromeCoverArt'
import Icon from '@/components/Icon'

const { width: SCREEN_W } = Dimensions.get('window')
const CARD_W = (SCREEN_W - 32 - 12) / 3

interface AlbumGridProps {
  server: NavidromeServerConfig | null
  albums: NavidromeAlbum[]
  onAlbumPress: (album: NavidromeAlbum) => void
  emptyText?: string
}

export function NavidromeAlbumGrid({ server, albums, onAlbumPress, emptyText = '暂无专辑' }: AlbumGridProps) {
  const t = useTheme()
  const showPlayCount = useNavidromePlaybackStore((s) => s.showPlayCount)
  if (albums.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={[styles.empty, { color: t.textMuted }]}>{emptyText}</Text>
      </View>
    )
  }
  return (
    <FlatList
      data={albums}
      scrollEnabled={false}
      numColumns={3}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      columnWrapperStyle={styles.row}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={{ width: CARD_W, marginBottom: 12 }}
          activeOpacity={0.7}
          onPress={() => onAlbumPress(item)}
        >
          <NavidromeCoverArt server={server} coverArtId={item.coverArt} width={CARD_W} aspectRatio={1} style={{ borderRadius: 8 }} />
          <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>{item.name}</Text>
          {item.artist ? <Text style={[styles.meta, { color: t.textMuted }]} numberOfLines={1}>{item.artist}</Text> : null}
          {showPlayCount && item.playCount != null && item.playCount > 0 ? (
            <Text style={[styles.rating, { color: t.warning }]}>▶ {item.playCount}</Text>
          ) : null}
        </TouchableOpacity>
      )}
    />
  )
}

interface ArtistGridProps {
  server: NavidromeServerConfig | null
  artists: NavidromeArtist[]
  onArtistPress: (artist: NavidromeArtist) => void
  emptyText?: string
}

export function NavidromeArtistGrid({ server, artists, onArtistPress, emptyText = '暂无艺术家' }: ArtistGridProps) {
  const t = useTheme()
  if (artists.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={[styles.empty, { color: t.textMuted }]}>{emptyText}</Text>
      </View>
    )
  }
  return (
    <FlatList
      data={artists}
      scrollEnabled={false}
      numColumns={3}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      columnWrapperStyle={styles.row}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={{ width: CARD_W, marginBottom: 12 }}
          activeOpacity={0.7}
          onPress={() => onArtistPress(item)}
        >
          <NavidromeCoverArt server={server} coverArtId={item.coverArt} width={CARD_W} aspectRatio={1} style={{ borderRadius: 100 }} />
          <Text style={[styles.title, { color: t.text, textAlign: 'center', marginTop: 6 }]} numberOfLines={2}>{item.name}</Text>
          {item.albumCount != null ? (
            <Text style={[styles.meta, { color: t.textMuted, textAlign: 'center' }]}>专辑 {item.albumCount}</Text>
          ) : null}
        </TouchableOpacity>
      )}
    />
  )
}

interface PlaylistGridProps {
  server: NavidromeServerConfig | null
  playlists: NavidromePlaylist[]
  onPlaylistPress: (playlist: NavidromePlaylist) => void
  emptyText?: string
}

export function NavidromePlaylistGrid({ server, playlists, onPlaylistPress, emptyText = '暂无播放列表' }: PlaylistGridProps) {
  const t = useTheme()
  if (playlists.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={[styles.empty, { color: t.textMuted }]}>{emptyText}</Text>
      </View>
    )
  }
  return (
    <FlatList
      data={playlists}
      numColumns={3}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      columnWrapperStyle={styles.row}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={{ width: CARD_W, marginBottom: 12 }}
          activeOpacity={0.7}
          onPress={() => onPlaylistPress(item)}
        >
          <NavidromeCoverArt server={server} coverArtId={item.coverArt} width={CARD_W} aspectRatio={1} style={{ borderRadius: 8 }} />
          <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>{item.name}</Text>
          {item.songCount != null ? (
            <Text style={[styles.meta, { color: t.textMuted }]}>曲目 {item.songCount}</Text>
          ) : null}
        </TouchableOpacity>
      )}
    />
  )
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 12, paddingBottom: 32 },
  row: { gap: 6 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  empty: { fontSize: 14 },
  title: { fontSize: 13, fontWeight: '500', marginTop: 6 },
  meta: { fontSize: 11, marginTop: 2 },
  rating: { fontSize: 11, marginTop: 2, fontWeight: '600' },
})