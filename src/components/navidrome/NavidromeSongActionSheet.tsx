import { View, Text, TouchableOpacity, Modal, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/lib/theme'
import { useNavidromePlayerStore } from '@/stores/navidromePlayerStore'
import { navidromeStar, navidromeUnstar, navidromeUpdatePlaylist } from '@/lib/api/navidrome'
import type { NavidromeSong, NavidromeServerConfig } from '@/types'
import Icon from '@/components/Icon'

export type SongActionSource = 'search' | 'album' | 'playlist' | 'queue' | 'nowPlaying'

export interface SongActionTarget {
  song: NavidromeSong
  source: SongActionSource
  indexInList?: number
}

interface Props {
  visible: boolean
  target: SongActionTarget | null
  server: NavidromeServerConfig | null
  onClose: () => void
  onAddToPlaylist: (songs: NavidromeSong[]) => void
  onNavigateAlbum?: (albumId: string) => void
  onNavigateArtist?: (artistId: string) => void
  onRefreshPlaylist?: () => Promise<void> | void
  playlistId?: string
}

export default function NavidromeSongActionSheet({
  visible, target, server, onClose, onAddToPlaylist, onNavigateAlbum, onNavigateArtist, onRefreshPlaylist, playlistId,
}: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const playList = useNavidromePlayerStore((s) => s.playList)
  const appendToQueue = useNavidromePlayerStore((s) => s.appendToQueue)
  const insertAfterCurrent = useNavidromePlayerStore((s) => s.insertAfterCurrent)
  const removeMany = useNavidromePlayerStore((s) => s.removeMany)

  if (!target) {
    return (
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        <View />
      </Modal>
    )
  }

  const song = target.song
  const hasAlbum = !!song.albumId
  const hasArtist = !!song.artistId

  const play = () => { playList([song], 0); onClose() }
  const playNext = () => { insertAfterCurrent([song]); onClose() }
  const addToQueue = () => { appendToQueue([song]); onClose() }
  const addToPlaylist = () => { onClose(); onAddToPlaylist([song]) }
  const goAlbum = () => {
    if (song.albumId && onNavigateAlbum) { onClose(); onNavigateAlbum(song.albumId) }
  }
  const goArtist = () => {
    if (song.artistId && onNavigateArtist) { onClose(); onNavigateArtist(song.artistId) }
  }
  const toggleStar = async () => {
    if (!server) { onClose(); return }
    try {
      if (song.starred) await navidromeUnstar(server, { id: song.id })
      else await navidromeStar(server, { id: song.id })
    } catch (e: any) {
      Alert.alert('操作失败', e?.message ?? String(e))
    }
    onClose()
  }
  const removeFromPlaylist = async () => {
    if (!server || !playlistId) { onClose(); return }
    const idx = target.indexInList ?? 0
    try {
      const result = await navidromeUpdatePlaylist(server, playlistId, { songIndexesToRemove: [idx] })
      if (!result.ok) throw new Error(result.error ?? '移除失败')
      if (onRefreshPlaylist) await onRefreshPlaylist()
    } catch (e: any) {
      Alert.alert('移除失败', e?.message ?? String(e))
    }
    onClose()
  }
  const removeFromQueue = () => { removeMany((s) => s.id === song.id); onClose() }

  const showPlayNext = target.source !== 'queue' && target.source !== 'nowPlaying'
  const showAppend = target.source !== 'queue' && target.source !== 'nowPlaying'
  const showGoAlbum = target.source !== 'album' && hasAlbum
  const showGoArtist = hasArtist
  const showRemovePlaylist = target.source === 'playlist' && !!playlistId
  const showRemoveQueue = target.source === 'queue'

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View
          style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + 8 }]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />
          <View style={[styles.header, { borderBottomColor: t.border }]}>
            <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{song.title}</Text>
            <Text style={[styles.subtitle, { color: t.textMuted }]} numberOfLines={1}>
              {song.artist ?? '未知艺术家'}{song.album ? ` · ${song.album}` : ''}
            </Text>
          </View>

          <Row icon="play" label="播放" onPress={play} t={t} />
          {showPlayNext ? <Row icon="skipNext" label="下一首播放" onPress={playNext} t={t} /> : null}
          {showAppend ? <Row icon="queueMusic" label="加入队列末尾" onPress={addToQueue} t={t} /> : null}
          <Row icon="queueMusic" label="加入歌单…" onPress={addToPlaylist} t={t} />
          {showGoAlbum ? <Row icon="music" label="前往该专辑" onPress={goAlbum} t={t} /> : null}
          {showGoArtist ? <Row icon="person" label="查看艺术家" onPress={goArtist} t={t} /> : null}
          <Row
            icon="star"
            label={song.starred ? '取消收藏' : '收藏'}
            onPress={toggleStar}
            t={t}
            iconColor={song.starred ? t.warning : t.textMuted}
          />
          {showRemovePlaylist ? (
            <Row icon="x" label="从歌单移除" destructive onPress={removeFromPlaylist} t={t} />
          ) : null}
          {showRemoveQueue ? (
            <Row icon="x" label="从队列移除" destructive onPress={removeFromQueue} t={t} />
          ) : null}

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onClose}
            style={[styles.cancelRow, { backgroundColor: t.bg }]}
          >
            <Text style={[styles.cancelText, { color: t.textMuted }]}>取消</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

function Row({
  icon, label, onPress, destructive, t, iconColor,
}: {
  icon: React.ComponentProps<typeof Icon>['name']
  label: string
  onPress: () => void
  destructive?: boolean
  t: ReturnType<typeof useTheme>
  iconColor?: string
}) {
  const color = destructive ? '#e5484d' : (iconColor ?? t.text)
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.row, { borderBottomColor: t.border }]}
    >
      <View style={styles.iconWrap}>
        <Icon name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#888', alignSelf: 'center', marginBottom: 8 },
  header: { paddingHorizontal: 18, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: { width: 28, alignItems: 'center', marginRight: 12 },
  label: { fontSize: 15, fontWeight: '500' },
  cancelRow: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 6,
  },
  cancelText: { fontSize: 15, fontWeight: '600' },
})
