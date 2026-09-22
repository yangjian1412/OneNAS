import { useState } from 'react'
import { View, Text, TouchableOpacity, Modal, StyleSheet, Alert, TextInput } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/lib/theme'
import { useNavidromePlayerStore } from '@/stores/navidromePlayerStore'
import { useNavidromeStore } from '@/stores/navidromeStore'
import {
  navidromeStar, navidromeUnstar,
  navidromeCreatePlaylist, navidromeUpdatePlaylist, navidromeDeletePlaylist,
} from '@/lib/api/navidrome'
import type { NavidromeSong, NavidromeServerConfig } from '@/types'
import Icon from '@/components/Icon'

export type AlbumActionSource = 'album' | 'playlist' | 'artist'

interface Props {
  visible: boolean
  source: AlbumActionSource
  title: string
  subTitle?: string
  starred?: boolean
  server: NavidromeServerConfig | null
  // album: song list of album + star target (album id)
  // playlist: song list of playlist + star target (playlist id - we don't star playlists directly here)
  // artist: songs of all albums (for "全部播放"); star target is artist id
  songs: NavidromeSong[]
  starId?: string
  starKind?: 'album' | 'artist'
  playlistId?: string  // required when source === 'playlist' for rename/delete
  onClose: () => void
  onPlayAll: () => void
  onAddToPlaylist: (songs: NavidromeSong[]) => void
  onStarToggle?: (next: boolean) => void
  onPlaylistRenamed?: (next: NavidromePlaylistLite) => void
  onPlaylistDeleted?: () => void
}

export interface NavidromePlaylistLite {
  id: string
  name: string
}

export default function NavidromeAlbumActionSheet({
  visible, source, title, subTitle, starred, server, songs, starId, starKind,
  playlistId, onClose, onPlayAll, onAddToPlaylist, onStarToggle, onPlaylistRenamed, onPlaylistDeleted,
}: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const playList = useNavidromePlayerStore((s) => s.playList)
  const appendToQueue = useNavidromePlayerStore((s) => s.appendToQueue)
  const refreshPlaylists = useNavidromeStore((s) => s.refreshPlaylists)

  const [renaming, setRenaming] = useState(false)
  const [renameText, setRenameText] = useState('')
  const [busy, setBusy] = useState(false)

  const play = () => { onPlayAll(); onClose() }
  const queueAll = () => { appendToQueue(songs); onClose() }
  const playlistAll = () => { onClose(); onAddToPlaylist(songs) }
  const star = async () => {
    if (!server || !starId || !starKind) { onClose(); return }
    try {
      const opts = starKind === 'album' ? { albumId: starId } : { artistId: starId }
      if (starred) await navidromeUnstar(server, opts)
      else await navidromeStar(server, opts)
      onStarToggle?.(!starred)
    } catch (e: any) {
      Alert.alert('操作失败', e?.message ?? String(e))
    }
    onClose()
  }

  const openRename = () => {
    setRenameText(title)
    setRenaming(true)
  }
  const submitRename = async () => {
    if (!server || !playlistId) return
    const name = renameText.trim()
    if (!name || name === title) { setRenaming(false); return }
    setBusy(true)
    try {
      // Subsonic rename: createPlaylist with playlistId + new name, no songs
      const result = await navidromeCreatePlaylist(server, { playlistId, name })
      if (!result.ok) throw new Error(result.error ?? '重命名失败')
      const refreshed = await refreshPlaylists()
      const next = refreshed.find((p) => p.id === playlistId)
      onPlaylistRenamed?.({ id: playlistId, name: next?.name ?? name })
      Alert.alert('已重命名', `已重命名为「${next?.name ?? name}」`)
      setRenaming(false)
      onClose()
    } catch (e: any) {
      Alert.alert('重命名失败', e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  const deletePlaylist = () => {
    if (!server || !playlistId) return
    Alert.alert('删除歌单', `确定删除「${title}」？此操作不可恢复`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            const result = await navidromeDeletePlaylist(server, playlistId)
            if (!result.ok) throw new Error(result.error ?? '删除失败')
            await refreshPlaylists()
            onPlaylistDeleted?.()
            onClose()
          } catch (e: any) {
            Alert.alert('删除失败', e?.message ?? String(e))
          }
        },
      },
    ])
  }

  const showStar = source !== 'playlist' && !!starId && !!starKind
  const showRename = source === 'playlist' && !!playlistId
  const showDelete = source === 'playlist' && !!playlistId

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={busy ? undefined : onClose}>
        <View
          style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + 8 }]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />
          <View style={[styles.header, { borderBottomColor: t.border }]}>
            <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{title}</Text>
            {subTitle ? <Text style={[styles.subtitle, { color: t.textMuted }]} numberOfLines={1}>{subTitle}</Text> : null}
            {renaming ? (
              <View style={{ marginTop: 12 }}>
                <TextInput
                  value={renameText}
                  onChangeText={setRenameText}
                  autoFocus
                  style={[styles.input, { color: t.text, backgroundColor: t.bg, borderColor: t.border }]}
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setRenaming(false)}
                    style={[styles.smallBtn, { backgroundColor: t.bg, borderColor: t.border }]}
                  >
                    <Text style={[styles.smallBtnText, { color: t.text }]}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={submitRename}
                    disabled={busy || !renameText.trim()}
                    style={[styles.smallBtn, { backgroundColor: renameText.trim() && !busy ? t.primary : t.bg, borderColor: t.primary }]}
                  >
                    <Text style={[styles.smallBtnText, { color: renameText.trim() && !busy ? '#fff' : t.textMuted }]}>确定</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>

          {!renaming ? (
            <View>
              <Row icon="play" label={`全部播放（${songs.length} 首）`} onPress={play} t={t} />
              <Row icon="queueMusic" label="全部加入队列末尾" onPress={queueAll} t={t} />
              <Row icon="queueMusic" label="全部加入歌单…" onPress={playlistAll} t={t} />
              {showStar ? (
                <Row
                  icon="star"
                  label={starred ? '取消收藏' : '收藏'}
                  onPress={star}
                  t={t}
                  iconColor={starred ? t.warning : t.textMuted}
                />
              ) : null}
              {showRename ? <Row icon="music" label="重命名歌单" onPress={openRename} t={t} /> : null}
              {showDelete ? <Row icon="x" label="删除歌单" destructive onPress={deletePlaylist} t={t} /> : null}
            </View>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onClose}
            disabled={busy}
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
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  smallBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  smallBtnText: { fontSize: 13, fontWeight: '600' },
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
