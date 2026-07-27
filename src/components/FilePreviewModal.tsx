import { useState, useEffect, useRef } from 'react'
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Modal, Alert, Platform, StatusBar, StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'
import { useTheme } from '@/lib/theme'
import { getFileContent, saveFileContent } from '@/lib/api/filebrowser'
import { getFileCategory, getFileIcon } from '@/lib/fileTypes'
import { buildUrl } from '@/lib/api/client'
import Icon from '@/components/Icon'
import type { FileItem, ServerConfig } from '@/types'

const encodeRemotePath = (path: string) => path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')

interface Props {
  visible: boolean
  file: FileItem | null
  server: ServerConfig
  token: string
  onClose: () => void
  onRefresh?: () => void
}

export default function FilePreviewModal({ visible, file, server, token, onClose, onRefresh }: Props) {
  const t = useTheme()
  const [content, setContent] = useState('')
  const [editContent, setEditContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const initialContentRef = useRef('')

  const category = file ? getFileCategory(file.name) : 'other'
  const isTextLike = category === 'text' || category === 'html'

  const rawUrl = file ? `${buildUrl(server.protocol, server.host, server.port)}/api/raw/${encodeRemotePath(file.path)}?inline=true` : ''

  useEffect(() => {
    if (!visible || !file || !isTextLike) return
    setLoading(true)
    setEditing(false)
    setContent('')
    setEditContent('')
    getFileContent(server, token, file.path).then((res) => {
      if (res.ok) {
        setContent(res.data)
        setEditContent(res.data)
        initialContentRef.current = res.data
      }
      setLoading(false)
    })
  }, [visible, file?.path])

  const hasChanges = editContent !== initialContentRef.current

  const handleSave = async () => {
    if (!file) return
    setSaving(true)
    const result = await saveFileContent(server, token, file.path, editContent)
    setSaving(false)
    if (result.ok) {
      setContent(editContent)
      initialContentRef.current = editContent
      setEditing(false)
      onRefresh?.()
    } else {
      Alert.alert('保存失败', result.error ?? '')
    }
  }

  const handleClose = () => {
    if (editing && hasChanges) {
      Alert.alert('放弃修改？', '你有未保存的更改。', [
        { text: '继续编辑', style: 'cancel' },
        { text: '放弃', style: 'destructive', onPress: () => { setEditing(false); setEditContent(content); onClose() } },
      ])
    } else {
      setEditing(false)
      onClose()
    }
  }

  if (!file) return null

  const canEdit = isTextLike

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.container, { backgroundColor: t.bg, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0 }]}>
        <View style={[styles.header, { backgroundColor: t.headerBg, borderBottomColor: t.border }]}>
          <TouchableOpacity style={styles.headerBtn} onPress={handleClose}>
            <Icon name="back" size={22} color={t.primary} />
          </TouchableOpacity>
          <View style={styles.headerTitle}>
            <Icon name={getFileIcon(file.name)} size={18} color={t.primary} />
            <Text style={[styles.headerTitleText, { color: t.text }]} numberOfLines={1}>{file.name}</Text>
          </View>
          {canEdit && !loading && (
            editing ? (
              <TouchableOpacity style={styles.headerBtn} onPress={handleSave} disabled={saving}>
                <Text style={[styles.headerAction, { color: t.primary }]}>{saving ? '保存中...' : '保存'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.headerBtn} onPress={() => setEditing(true)}>
                <Text style={[styles.headerAction, { color: t.primary }]}>编辑</Text>
              </TouchableOpacity>
            )
          )}
          {!canEdit && <View style={{ width: 44 }} />}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={t.primary} />
          </View>
        ) : category === 'image' ? (
          <View style={styles.center}>
            <ImageFromUrl url={rawUrl} />
          </View>
        ) : category === 'html' && !editing ? (
          <WebView source={{ uri: rawUrl }} style={{ flex: 1, backgroundColor: t.bg }} />
        ) : editing ? (
          <TextInput
            style={[styles.editor, { backgroundColor: t.inputBg, color: t.text, borderColor: t.border }]}
            value={editContent}
            onChangeText={setEditContent}
            multiline
            autoFocus
            textAlignVertical="top"
          />
        ) : (
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            <Text style={[styles.contentText, { color: t.text }]} selectable>{content}</Text>
          </ScrollView>
        )}
      </View>
    </Modal>
  )
}

function ImageFromUrl({ url }: { url: string }) {
  const [error, setError] = useState(false)
  if (error) {
    return <Text style={{ color: '#999', fontSize: 14 }}>加载图片失败</Text>
  }
  return (
    <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
      <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
        <Icon name="fileImage" size={64} color="#999" />
        <Text style={{ color: '#999', marginTop: 8, fontSize: 13 }}>图片预览</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  headerTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  headerTitleText: { fontSize: 16, fontWeight: '600' },
  headerAction: { fontSize: 15, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollArea: { flex: 1 },
  scrollContent: { padding: 16 },
  contentText: { fontSize: 14, lineHeight: 22 },
  editor: { flex: 1, padding: 16, fontSize: 14, lineHeight: 22, fontFamily: 'monospace', borderWidth: 0, borderRadius: 0 },
})
