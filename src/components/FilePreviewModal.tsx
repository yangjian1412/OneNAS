import { useState, useEffect, useRef } from 'react'
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Modal, Alert, Platform, StatusBar, StyleSheet, Image } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import { startActivityAsync } from 'expo-intent-launcher'
import { WebView } from 'react-native-webview'
import { useTheme } from '@/lib/theme'
import { getFileContent, saveFileContent } from '@/lib/api/filebrowser'
import { getFileCategory, getFileIcon } from '@/lib/fileTypes'
import { buildUrl } from '@/lib/api/client'
import Icon from '@/components/Icon'
import type { FileItem, ServerConfig } from '@/types'

const encodeRemotePath = (path: string) => path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')

const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

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
          <ImageFromUrl url={rawUrl} token={token} fileName={file.name} />
        ) : category === 'html' && !editing ? (
          <WebView source={{ uri: rawUrl }} style={{ flex: 1, backgroundColor: t.bg }} />
        ) : category === 'pdf' || category === 'system' ? (
          file.size > 20 * 1024 * 1024 ? (
            <View style={styles.center}>
              <Icon name="filePdf" size={64} color="#999" />
              <Text style={{ color: '#999', marginTop: 12, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 }}>
                文件较大 ({formatBytes(file.size)})，请下载后在手机内打开
              </Text>
            </View>
          ) : (
            <SystemViewer url={rawUrl} token={token} fileName={file.name} onOpened={handleClose} />
          )
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

function ImageFromUrl({ url, token, fileName }: { url: string; token: string; fileName: string }) {
  const [dataUri, setDataUri] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const ext = fileName.split('.').pop()?.toLowerCase()

  useEffect(() => {
    if (ext === 'svg') { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(url, { headers: { 'X-Auth': token } })
        if (!res.ok) throw new Error(`${res.status}`)
        const blob = await res.blob()
        const reader = new FileReader()
        reader.onload = () => { if (!cancelled) { setDataUri(reader.result as string); setLoading(false) } }
        reader.onerror = () => { if (!cancelled) { setError(true); setLoading(false) } }
        reader.readAsDataURL(blob)
      } catch {
        if (!cancelled) { setError(true); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [url, token])

  if (ext === 'svg' || error) {
    return (
      <View style={styles.center}>
        <Icon name="fileImage" size={64} color="#999" />
        <Text style={{ color: '#999', marginTop: 8, fontSize: 13 }}>
          {error ? '加载图片失败' : '图片预览'}
        </Text>
      </View>
    )
  }
  return (
    <View style={styles.center}>
      {(loading || dataUri) && loading && <ActivityIndicator size="large" color="#666" style={{ position: 'absolute' }} />}
      {dataUri ? (
        <Image
          source={{ uri: dataUri }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
        />
      ) : loading ? (
        <ActivityIndicator size="large" color="#666" />
      ) : null}
    </View>
  )
}

function SystemViewer({ url, token, fileName, onOpened }: { url: string; token: string; fileName: string; onOpened: () => void }) {
  const [phase, setPhase] = useState<'downloading' | 'opening' | 'error'>('downloading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
        const mimeType = MIME_MAP[ext] ?? 'application/octet-stream'
        const safeName = fileName.replace(/[^\w.\-]/g, '_')
        const cachePath = `${FileSystem.cacheDirectory}sys-${Date.now()}-${safeName}`
        const result = await FileSystem.downloadAsync(url, cachePath, {
          headers: { 'X-Auth': token },
        })
        if (cancelled) return
        const contentUri = await FileSystem.getContentUriAsync(result.uri)
        if (cancelled) return
        setPhase('opening')
        try {
          await startActivityAsync('android.intent.action.VIEW', {
            data: contentUri,
            type: mimeType,
            flags: 1,
          })
        } catch (openErr: any) {
          throw new Error(openErr?.message ?? 'open failed')
        }
        onOpened()
      } catch (e: any) {
        if (cancelled) return
        setErrorMsg(e?.message ?? 'unknown')
        setPhase('error')
      }
    })()
    return () => { cancelled = true }
  }, [url, token, fileName])

  if (phase === 'error') {
    return (
      <View style={styles.center}>
        <Icon name="filePdf" size={64} color="#999" />
        <Text style={{ color: '#999', marginTop: 8, fontSize: 13 }}>打开失败{errorMsg ? `: ${errorMsg}` : ''}</Text>
      </View>
    )
  }
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#666" />
      <Text style={{ color: '#999', marginTop: 12, fontSize: 13 }}>
        {phase === 'downloading' ? '下载中...' : '正在打开...'}
      </Text>
    </View>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
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
