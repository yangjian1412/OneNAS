import { useState, useEffect, useRef } from 'react'
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Modal, Alert, Platform, StatusBar, StyleSheet, Image, Pressable, PanResponder, KeyboardAvoidingView } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import { startActivityAsync } from 'expo-intent-launcher'
import { VideoView, useVideoPlayer } from 'expo-video'
import { useAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio'
import { useTheme } from '@/lib/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getFileContent, saveFileContent } from '@/lib/api/filebrowser'
import { getFileCategory, getFileIcon } from '@/lib/fileTypes'
import { buildUrl } from '@/lib/api/client'
import { useImmersive } from '@/lib/immersive'
import Icon from '@/components/Icon'
import { getRawFileUrl } from '@/lib/api/fileManager'
import { webDavDownloadUrl, webDavAuthHeader, webDavGetResourceInfo, webDavUpload } from '@/lib/api/webdav'
import type { FileItem, ServerConfig, WebDavConfig, FileBackend } from '@/types'

const encodeRemotePath = (path: string) => path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')

// 与 fileScreen 同样的 GBK 回退解码
function decodeTextBuffer(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u8)
  } catch {}
  try {
    return new TextDecoder('gbk').decode(u8)
  } catch {}
  try {
    return new TextDecoder('utf-8').decode(u8)
  } catch {
    return ''
  }
}

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
  backend: FileBackend
  webdavServer: WebDavConfig | null
  onClose: () => void
  onRefresh?: () => void
}

export default function FilePreviewModal({ visible, file, server, token, backend, webdavServer, onClose, onRefresh }: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const [content, setContent] = useState('')
  const [editContent, setEditContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const initialContentRef = useRef('')
  useImmersive(visible && !editing)

  const category = file ? getFileCategory(file.name) : 'other'
  const isTextLike = category === 'text' || category === 'html'

  const rawUrl = file ? getRawFileUrl(server, token, file.path, backend, webdavServer) : ''
  const authHeaders: Record<string, string> = backend === 'webdav' && webdavServer
    ? { Authorization: webDavAuthHeader(webdavServer) }
    : { 'X-Auth': token }

  useEffect(() => {
    if (!visible || !file || !isTextLike) return
    setLoading(true)
    setEditing(false)
    setContent('')
    setEditContent('')
    if (backend === 'webdav') {
      if (!webdavServer) { setLoading(false); return }
      ;(async () => {
        try {
          const res = await fetch(rawUrl, { headers: authHeaders })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const buf = await res.arrayBuffer()
          const text = decodeTextBuffer(buf)
          setContent(text)
          setEditContent(text)
          initialContentRef.current = text
        } catch (e: any) {
          Alert.alert('加载失败', e?.message ?? '')
        } finally { setLoading(false) }
      })()
      return
    }
    getFileContent(server, token, file.path).then((res) => {
      if (res.ok) {
        setContent(res.data)
        setEditContent(res.data)
        initialContentRef.current = res.data
      }
      setLoading(false)
    })
  }, [visible, file?.path, backend, webdavServer?.url])

  const hasChanges = editContent !== initialContentRef.current

  const handleSave = async () => {
    if (!file) return
    setSaving(true)
    if (backend === 'webdav' && webdavServer) {
      const ok = await webDavUpload(webdavServer, file.path, editContent, 'text/plain;charset=utf-8')
      setSaving(false)
      if (ok) {
        setContent(editContent)
        initialContentRef.current = editContent
        setEditing(false)
        onRefresh?.()
      } else {
        Alert.alert('保存失败', 'WebDAV 上传失败')
      }
      return
    }
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
      <View style={[styles.container, { backgroundColor: t.bg, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0, paddingBottom: insets.bottom }]}>
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
          <ImageFromUrl url={rawUrl} headers={authHeaders} fileName={file.name} />
        ) : category === 'video' ? (
          <VideoViewer url={rawUrl} headers={authHeaders} />
        ) : category === 'audio' ? (
          <AudioPlayer url={rawUrl} headers={authHeaders} fileName={file.name} filePath={file.path} />
        ) : category === 'html' && !editing ? (
          <HtmlSourceView url={rawUrl} headers={authHeaders} />
        ) : category === 'pdf' || category === 'system' ? (
          file.size > 20 * 1024 * 1024 ? (
            <View style={styles.center}>
              <Icon name="filePdf" size={64} color="#999" />
              <Text style={{ color: '#999', marginTop: 12, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 }}>
                文件较大 ({formatBytes(file.size)})，请下载后在手机内打开
              </Text>
            </View>
          ) : (
            <SystemViewer url={rawUrl} headers={authHeaders} fileName={file.name} onOpened={handleClose} />
          )
        ) : editing ? (
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            <TextInput
              style={[styles.editor, { backgroundColor: t.inputBg, color: t.text, borderColor: t.border }]}
              value={editContent}
              onChangeText={setEditContent}
              multiline
              autoFocus
              textAlignVertical="top"
            />
          </KeyboardAvoidingView>
        ) : (
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            <Text style={[styles.contentText, { color: t.text }]} selectable>{content}</Text>
          </ScrollView>
        )}
      </View>
    </Modal>
  )
}

function ImageFromUrl({ url, headers, fileName }: { url: string; headers: Record<string, string>; fileName: string }) {
  const [dataUri, setDataUri] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const ext = fileName.split('.').pop()?.toLowerCase()

  useEffect(() => {
    if (ext === 'svg') { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(url, { headers })
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
  }, [url, JSON.stringify(headers)])

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

function SystemViewer({ url, headers, fileName, onOpened }: { url: string; headers: Record<string, string>; fileName: string; onOpened: () => void }) {
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
        const result = await FileSystem.downloadAsync(url, cachePath, { headers })
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
  }, [url, JSON.stringify(headers), fileName])

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

function HtmlSourceView({ url, headers }: { url: string; headers: Record<string, string> }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(url, { headers })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buf = await res.arrayBuffer()
        const t = decodeTextBuffer(buf)
        if (!cancelled) setText(t)
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [url, JSON.stringify(headers)])
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#666" /></View>
  if (error) return <View style={styles.center}><Text style={{ color: '#999' }}>{error}</Text></View>
  return (
    <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
      <Text style={[styles.contentText, { color: t.text }]} selectable>{text}</Text>
    </ScrollView>
  )
}

function VideoViewer({ url, headers }: { url: string; headers: Record<string, string> }) {
  const player = useVideoPlayer({ uri: url, headers })

  return (
    <View style={styles.mediaContainer}>
      <VideoView
        player={player}
        style={styles.mediaPlayer}
        allowsFullscreen
        allowsPictureInPicture
      />
    </View>
  )
}

function AudioPlayer({ url, headers, fileName, filePath }: { url: string; headers: Record<string, string>; fileName?: string; filePath?: string }) {
  const t = useTheme()
  const player = useAudioPlayer({ uri: url, headers })
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const progressRef = useRef<View>(null)
  const barWidth = useRef(0)
  const barLeft = useRef(0)
  const seekFn = useRef<(pageX: number, doSeek: boolean) => void>(() => {})

  useEffect(() => {
    let cancelled = false
    // 预览弹窗打开时允许后台播放 + 锁屏控制（Android 13+ 需要通知权限）
    ;(async () => {
      if (Platform.OS === 'android' && (Platform.Version as number) >= 33) {
        try {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
        } catch {}
      }
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          interruptionMode: 'doNotMix',
          shouldPlayInBackground: true,
        })
      } catch {}
      try {
        await setIsAudioActiveAsync(true)
      } catch {}
      if (cancelled) return
      try {
        const parent = (filePath ?? '').replace(/\/+$/, '').split('/').slice(0, -1).join('/').replace(/^\/+/, '') || undefined
        player.setActiveForLockScreen(true, {
          title: fileName ?? '',
          artist: parent,
          albumTitle: '',
        })
      } catch {}
    })()
    return () => {
      cancelled = true
      try { player.setActiveForLockScreen(false) } catch {}
      try {
        void setAudioModeAsync({
          shouldPlayInBackground: false,
          interruptionMode: 'mixWithOthers',
        })
      } catch {}
    }
  }, [player, fileName, filePath])

  useEffect(() => {
    const sub = (player as any).addListener?.('playbackStatusUpdate', (status: any) => {
      if (typeof status.currentTime === 'number') {
        setCurrentTime(status.currentTime)
      }
      if (typeof status.duration === 'number') {
        setDuration(status.duration)
      }
      if (typeof status.playing === 'boolean') {
        setPlaying(status.playing)
      }
      if (typeof status.currentTime === 'number' && typeof status.duration === 'number' && status.duration > 0) {
        setProgress(status.currentTime / status.duration)
      }
    })
    return () => { sub?.remove?.() }
  }, [player])

  const togglePlay = () => {
    if (playing) { player.pause(); setPlaying(false) }
    else { player.play(); setPlaying(true) }
  }

  const formatTime = (seconds: number) => {
    const total = Math.floor(seconds)
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  seekFn.current = (pageX: number, doSeek: boolean) => {
    if (!duration || !barWidth.current) return
    const ratio = Math.max(0, Math.min(1, (pageX - barLeft.current) / barWidth.current))
    setProgress(ratio)
    if (doSeek) {
      player.seekTo(ratio * duration)
    }
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => { seekFn.current(evt.nativeEvent.pageX, false) },
      onPanResponderMove: (evt) => { seekFn.current(evt.nativeEvent.pageX, false) },
      onPanResponderRelease: (evt) => { seekFn.current(evt.nativeEvent.pageX, true) },
    })
  ).current

  return (
    <View style={styles.audioContainer}>
      <Pressable onPress={togglePlay} style={[styles.audioPlayBtn, { backgroundColor: t.primary }]}>
        <Icon name={playing ? 'pause' : 'play'} size={36} color="#fff" />
      </Pressable>
      <View
        ref={progressRef}
        style={styles.audioProgressWrap}
        onLayout={() => {
          progressRef.current?.measureInWindow((x, y, w) => {
            barLeft.current = x
            barWidth.current = w
          })
        }}
        {...panResponder.panHandlers}
      >
        <View style={styles.audioProgressTrack}>
          <View style={[styles.audioProgressBar, { width: `${progress * 100}%`, backgroundColor: t.primary }]} />
          <View style={[styles.audioThumb, { left: `${progress * 100}%`, backgroundColor: t.primary }]} />
        </View>
      </View>
      <Text style={[styles.audioTime, { color: t.text }]}>
        {formatTime(currentTime)} / {formatTime(duration)}
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
  mediaContainer: { flex: 1, backgroundColor: '#000' },
  mediaPlayer: { flex: 1 },
  audioContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  audioPlayBtn: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginVertical: 24 },
  
  audioProgress: { width: '100%', height: 4, backgroundColor: '#333', borderRadius: 2, marginTop: 16 },
  audioProgressBar: { height: '100%', borderRadius: 2 },
  audioTime: { marginTop: 12, fontSize: 13 },
  audioProgressWrap: { width: '100%', paddingVertical: 12, marginTop: 4 },
  audioProgressTrack: { height: 4, backgroundColor: '#333', borderRadius: 2, justifyContent: 'center' },
  audioThumb: { width: 14, height: 14, borderRadius: 7, position: 'absolute', marginLeft: -7, top: -5 },
})
