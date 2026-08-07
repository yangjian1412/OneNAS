import { useEffect, useState, useCallback } from 'react'
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet, TextInput, ActivityIndicator, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Icon from '@/components/Icon'
import { useTheme } from '@/lib/theme'

interface FolderPickerModalProps {
  visible: boolean
  title: string
  initialPath: string
  listFolders: (path: string) => Promise<{ ok: boolean; folders?: string[]; error?: string }>
  createFolder?: (parentPath: string, name: string) => Promise<{ ok: boolean; error?: string }>
  excludePathPrefix?: string
  onConfirm: (path: string) => void
  onClose: () => void
}

export default function FolderPickerModal({
  visible, title, initialPath, listFolders, createFolder, excludePathPrefix, onConfirm, onClose,
}: FolderPickerModalProps) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const [currentPath, setCurrentPath] = useState<string>('/')
  const [folders, setFolders] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const normalized = currentPath.endsWith('/') ? currentPath.replace(/\/+$/, '') : currentPath
  const segments = normalized === '' || normalized === '/' ? [] : normalized.replace(/^\//, '').split('/').filter(Boolean)

  const load = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    const res = await listFolders(path)
    if (res.ok) {
      setFolders(res.folders ?? [])
    } else {
      setFolders([])
      setError(res.error ?? '加载失败')
    }
    setLoading(false)
  }, [listFolders])

  useEffect(() => {
    if (visible) {
      const start = initialPath && initialPath.startsWith('/') ? initialPath : '/'
      setCurrentPath(start === '/' ? '/' : start.replace(/\/+$/, '') || '/')
      void load(start === '/' ? '/' : start.replace(/\/+$/, '') || '/')
      setCreating(false)
      setNewName('')
    }
  }, [visible, initialPath, load])

  const enterFolder = (name: string) => {
    const next = normalized === '' || normalized === '/' ? `/${name}` : `${normalized}/${name}`
    setCurrentPath(next)
    void load(next)
  }

  const goUp = () => {
    if (segments.length === 0) return
    const next = '/' + segments.slice(0, -1).join('/')
    setCurrentPath(next === '/' ? '/' : next)
    void load(next === '/' ? '/' : next)
  }

  const jumpToSegment = (idx: number) => {
    const next = '/' + segments.slice(0, idx + 1).join('/')
    setCurrentPath(next === '/' ? '/' : next)
    void load(next === '/' ? '/' : next)
  }

  const isExcluded = (folder: string) => {
    if (!excludePathPrefix) return false
    const candidate = normalized === '' || normalized === '/' ? `/${folder}` : `${normalized}/${folder}`
    const base = excludePathPrefix.replace(/\/+$/, '')
    return candidate === base || candidate.startsWith(base + '/')
  }

  const handleCreate = async () => {
    if (!createFolder) return
    const name = newName.trim()
    if (!name) return
    if (name.includes('/')) { Alert.alert('提示', '文件夹名称不能包含 /'); return }
    const parent = normalized === '' || normalized === '/' ? '/' : normalized
    const res = await createFolder(parent, name)
    if (res.ok) {
      setNewName('')
      setCreating(false)
      void load(parent)
    } else {
      Alert.alert('新建失败', res.error ?? '未知错误')
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: t.bg, paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { backgroundColor: t.headerBg, borderBottomColor: t.border }]}>
          <Text style={[styles.title, { color: t.text }]}>{title}</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="x" size={24} color={t.text} />
          </TouchableOpacity>
        </View>

        {/* 面包屑 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.breadcrumbBar, { borderBottomColor: t.border, backgroundColor: t.headerBg }]}>
          <TouchableOpacity onPress={() => { setCurrentPath('/'); void load('/') }} style={styles.crumb}>
            <Text style={[styles.crumbText, { color: t.primary }]}>/</Text>
          </TouchableOpacity>
          {segments.map((seg, idx) => (
            <View key={`${seg}-${idx}`} style={styles.crumbWrap}>
              <Text style={[styles.crumbSep, { color: t.textMuted }]}>/</Text>
              <TouchableOpacity onPress={() => jumpToSegment(idx)} style={styles.crumb}>
                <Text style={[styles.crumbText, { color: idx === segments.length - 1 ? t.text : t.primary }]}>{seg}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        {/* 列表 */}
        <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 12 }}>
          {segments.length > 0 && (
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: t.border }]}
              onPress={goUp}
            >
              <Icon name="chevronUp" size={20} color={t.textSecondary} />
              <Text style={[styles.rowText, { color: t.textSecondary, marginLeft: 8 }]} numberOfLines={1}>..（上一级）</Text>
            </TouchableOpacity>
          )}
          {loading ? (
            <View style={styles.center}><ActivityIndicator color={t.primary} /></View>
          ) : error ? (
            <View style={styles.center}><Text style={{ color: t.danger }}>{error}</Text></View>
          ) : folders.length === 0 ? (
            <View style={styles.center}><Text style={{ color: t.textMuted }}>空文件夹</Text></View>
          ) : (
            folders.map((name) => {
              const excluded = isExcluded(name)
              return (
                <TouchableOpacity
                  key={name}
                  style={[styles.row, { borderBottomColor: t.border }, excluded && { opacity: 0.4 }]}
                  onPress={() => !excluded && enterFolder(name)}
                  disabled={excluded}
                >
                  <Icon name="folderEmpty" size={20} color={excluded ? t.textMuted : t.primary} />
                  <Text style={[styles.rowText, { color: excluded ? t.textMuted : t.text, marginLeft: 8 }]} numberOfLines={1}>{name}</Text>
                  {excluded && <Text style={[styles.hint, { color: t.textMuted, marginLeft: 'auto' }]}>不可选</Text>}
                </TouchableOpacity>
              )
            })
          )}
        </ScrollView>

        {/* 新建文件夹（可选项） */}
        {creating && createFolder && (
          <View style={[styles.createBar, { borderTopColor: t.border, backgroundColor: t.card }]}>
            <TextInput
              autoFocus
              value={newName}
              onChangeText={setNewName}
              placeholder="新文件夹名称"
              placeholderTextColor={t.textMuted}
              style={[styles.createInput, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => { setCreating(false); setNewName('') }} style={styles.createBtn}>
              <Text style={{ color: t.textMuted }}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCreate} style={[styles.createBtn, { backgroundColor: t.primary, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, marginLeft: 6 }]}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>新建</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 底栏：新建按钮 + 确认 */}
        <View style={[styles.footer, { borderTopColor: t.border, backgroundColor: t.headerBg }]}>
          {createFolder && !creating && (
            <TouchableOpacity style={[styles.iconBtn, { borderColor: t.border }]} onPress={() => setCreating(true)}>
              <Icon name="plus" size={18} color={t.primary} />
              <Text style={[styles.iconBtnText, { color: t.primary }]}>新建</Text>
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={onClose}
            style={[styles.cancelBtn, { borderColor: t.border }]}
          >
            <Text style={{ color: t.textMuted }}>取消</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onConfirm(normalized === '' || normalized === '/' ? '/' : normalized)}
            style={[styles.confirmBtn, { backgroundColor: t.primary }]}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>使用当前目录</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: 40,
  },
  title: { fontSize: 17, fontWeight: '700' },
  closeBtn: { padding: 4 },
  breadcrumbBar: { flexGrow: 0, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  crumb: { paddingHorizontal: 4, paddingVertical: 2 },
  crumbWrap: { flexDirection: 'row', alignItems: 'center' },
  crumbText: { fontSize: 14, fontWeight: '500' },
  crumbSep: { fontSize: 14, marginHorizontal: 2 },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { fontSize: 15, flexShrink: 1 },
  hint: { fontSize: 12 },
  center: { paddingVertical: 30, alignItems: 'center' },
  createBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  createInput: { flex: 1, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  createBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  iconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  iconBtnText: { fontSize: 13, fontWeight: '500' },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  confirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
  },
})