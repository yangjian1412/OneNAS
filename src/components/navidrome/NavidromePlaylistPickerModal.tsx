import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, Modal, FlatList, Image, StyleSheet,
  TextInput, ActivityIndicator, Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/lib/theme'
import { useNavidromeStore } from '@/stores/navidromeStore'
import { navidromeCreatePlaylist, navidromeUpdatePlaylist, navidromeGetCoverArtUrl } from '@/lib/api/navidrome'
import type { NavidromePlaylist, NavidromeServerConfig, NavidromeSong } from '@/types'
import Icon from '@/components/Icon'

interface Props {
  visible: boolean
  songs: NavidromeSong[]
  server: NavidromeServerConfig | null
  onClose: () => void
  onDone?: (playlist: NavidromePlaylist, action: 'created' | 'added') => void
}

export default function NavidromePlaylistPickerModal({ visible, songs, server, onClose, onDone }: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const playlists = useNavidromeStore((s) => s.playlists)
  const refreshPlaylists = useNavidromeStore((s) => s.refreshPlaylists)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (visible) {
      setCreating(false)
      setNewName('')
      // Refresh on open so newly-created playlists appear immediately on next open
      if (server) void refreshPlaylists()
    }
  }, [visible, server, refreshPlaylists])

  const songIds = songs.map((s) => s.id).filter(Boolean) as string[]

  const addToExisting = async (pl: NavidromePlaylist) => {
    if (!server || songIds.length === 0) return
    setBusy(true)
    try {
      const result = await navidromeUpdatePlaylist(server, pl.id, { songIdsToAdd: songIds })
      if (!result.ok) throw new Error(result.error ?? '加入歌单失败')
      const refreshed = await refreshPlaylists()
      const next = refreshed.find((p) => p.id === pl.id) ?? pl
      onDone?.(next, 'added')
      Alert.alert('已加入', `已加入「${next.name}」`)
      onClose()
    } catch (e: any) {
      Alert.alert('加入失败', e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  const createAndAdd = async () => {
    if (!server) return
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    try {
      const create = await navidromeCreatePlaylist(server, { name })
      if (!create.ok || !create.playlistId) throw new Error(create.error ?? '创建歌单失败')
      const update = await navidromeUpdatePlaylist(server, create.playlistId, { songIdsToAdd: songIds })
      if (!update.ok) throw new Error(update.error ?? '加入新歌单失败')
      const refreshed = await refreshPlaylists()
      const next = refreshed.find((p) => p.id === create.playlistId) ?? { id: create.playlistId, name }
      onDone?.(next, 'created')
      Alert.alert('已创建', `已创建「${next.name}」并加入 ${songIds.length} 首`)
      onClose()
    } catch (e: any) {
      Alert.alert('创建失败', e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={busy ? undefined : onClose}>
        <View
          style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + 8 }]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />
          <View style={[styles.header, { borderBottomColor: t.border }]}>
            <Text style={[styles.title, { color: t.text }]}>加入歌单</Text>
            <Text style={[styles.subtitle, { color: t.textMuted }]}>共 {songs.length} 首</Text>
          </View>

          {creating ? (
            <View style={[styles.createWrap, { borderBottomColor: t.border }]}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="歌单名称"
                placeholderTextColor={t.textMuted}
                autoFocus
                style={[styles.input, { color: t.text, backgroundColor: t.bg, borderColor: t.border }]}
              />
              <View style={styles.createActions}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => { setCreating(false); setNewName('') }}
                  disabled={busy}
                  style={[styles.createBtn, { backgroundColor: t.bg, borderColor: t.border }]}
                >
                  <Text style={[styles.createBtnText, { color: t.text }]}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={createAndAdd}
                  disabled={busy || !newName.trim()}
                  style={[
                    styles.createBtn,
                    { backgroundColor: newName.trim() && !busy ? t.primary : t.bg, borderColor: t.primary },
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={[styles.createBtnText, { color: newName.trim() ? '#fff' : t.textMuted }]}>创建并加入</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <FlatList
              data={playlists}
              keyExtractor={(p) => p.id}
              style={{ maxHeight: 360 }}
              ListHeaderComponent={
                playlists.length === 0 ? (
                  <Text style={[styles.empty, { color: t.textMuted }]}>还没有歌单，点下方新建</Text>
                ) : null
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  activeOpacity={0.7}
                  disabled={busy}
                  onPress={() => addToExisting(item)}
                  style={[styles.row, { borderBottomColor: t.border }]}
                >
                  {item.coverArt && server ? (
                    <Image
                      source={{ uri: navidromeGetCoverArtUrl(server, item.coverArt, 80) as string }}
                      style={styles.cover}
                    />
                  ) : (
                    <View style={[styles.cover, { backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }]}>
                      <Icon name="queueMusic" size={18} color="#fff" />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.rowTitle, { color: t.text }]} numberOfLines={1}>{item.name}</Text>
                    {item.songCount != null ? (
                      <Text style={[styles.rowMeta, { color: t.textMuted }]}>{item.songCount} 首</Text>
                    ) : null}
                  </View>
                  <Icon name="plus" size={20} color={t.primary} />
                </TouchableOpacity>
              )}
            />
          )}

          {!creating ? (
            <TouchableOpacity
              activeOpacity={0.7}
              disabled={busy}
              onPress={() => setCreating(true)}
              style={[styles.newRow, { backgroundColor: t.bg, borderTopColor: t.border }]}
            >
              <Icon name="plus" size={20} color={t.primary} />
              <Text style={[styles.newRowText, { color: t.primary }]}>新建歌单</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.7}
            disabled={busy}
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

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#888', alignSelf: 'center', marginBottom: 8 },
  header: { paddingHorizontal: 18, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 4 },
  empty: { padding: 24, textAlign: 'center', fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cover: { width: 40, height: 40, borderRadius: 6 },
  rowTitle: { fontSize: 14, fontWeight: '500' },
  rowMeta: { fontSize: 11, marginTop: 2 },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  newRowText: { fontSize: 14, fontWeight: '600' },
  createWrap: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  createActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  createBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  createBtnText: { fontSize: 14, fontWeight: '600' },
  cancelRow: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 6,
  },
  cancelText: { fontSize: 15, fontWeight: '600' },
})
