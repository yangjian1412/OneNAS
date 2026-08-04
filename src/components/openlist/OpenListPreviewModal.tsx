import { useEffect, useState, useRef } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Image, Pressable, PanResponder, Alert, StyleSheet, Platform, StatusBar } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { VideoView, useVideoPlayer } from 'expo-video'
import { useAudioPlayer } from 'expo-audio'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import { getFileCategory } from '@/lib/fileTypes'
import { openListGetFileUrl, openListGetProxyUrl } from '@/lib/api/openlist'
import type { OpenListFile, OpenListServerConfig } from '@/types'

interface Props {
  visible: boolean
  file: OpenListFile | null
  server: OpenListServerConfig
  onClose: () => void
  onDownload?: () => void
  onReLogin?: () => void
}

const decodeTextBuffer = (buf: ArrayBuffer): string => {
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

export default function OpenListPreviewModal({ visible, file, server, onClose, onDownload, onReLogin }: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  // 优先 virtual_path（alist 返回的全路径），其次 path，最后才根据当前目录拼接
  const filePath = file?.virtual_path ?? file?.path ?? ''
  const directUrl = file ? openListGetFileUrl(server, filePath, file.sign) : ''
  const proxyUrl = file ? openListGetProxyUrl(server, filePath, file.sign) : ''
  // 优先用 /p/ 代理（302 重定向，绕开 /d/ 在某些 alist 版本上的 panic）
  const rawUrl = proxyUrl || directUrl
  const authHeaders: Record<string, string> = server.token ? { Authorization: server.token } : {}
  const category = file ? getFileCategory(file.name) : 'other'

  const copyUrl = async () => {
    try { await Clipboard.setStringAsync(`${proxyUrl}\n${directUrl}`); Alert.alert('已复制', '代理 URL 与直链 URL（两行）已复制') }
    catch { Alert.alert('复制失败', '请稍后再试') }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: t.bg, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0, paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { backgroundColor: t.headerBg, borderBottomColor: t.border }]}>
          <TouchableOpacity style={styles.headerBtn} onPress={onClose}>
            <Icon name="back" size={22} color={t.primary} />
          </TouchableOpacity>
          <View style={styles.headerTitle}>
            <Text style={[styles.headerTitleText, { color: t.text }]} numberOfLines={1}>{file?.name}</Text>
          </View>
          <TouchableOpacity style={styles.headerBtn} onPress={copyUrl}>
            <Icon name="shareManage" size={20} color={t.primary} />
          </TouchableOpacity>
          {onDownload && !file?.is_dir ? (
            <TouchableOpacity style={styles.headerBtn} onPress={onDownload}>
              <Icon name="downloadRounded" size={22} color={t.primary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 44 }} />
          )}
        </View>

        {!file ? null : category === 'image' ? (
          <ImageViewer url={rawUrl} headers={authHeaders} fileName={file.name} onReLogin={onReLogin} />
        ) : category === 'video' ? (
          <VideoViewer url={rawUrl} headers={authHeaders} />
        ) : category === 'audio' ? (
          <AudioViewer url={rawUrl} headers={authHeaders} t={t} />
        ) : category === 'text' ? (
          <TextViewer url={rawUrl} headers={authHeaders} t={t} />
        ) : (
          <View style={styles.center}>
            <Icon name="file" size={64} color="#999" />
            <Text style={{ color: '#999', marginTop: 12, fontSize: 14 }}>此格式暂不支持预览</Text>
            {onDownload ? (
              <TouchableOpacity onPress={onDownload} style={[styles.downloadBtn, { backgroundColor: t.primary }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>下载</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>
    </Modal>
  )
}

function ImageViewer({ url, headers, fileName, onReLogin }: { url: string; headers: Record<string, string>; fileName: string; onReLogin?: () => void }) {
  const [dataUri, setDataUri] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorInfo, setErrorInfo] = useState<{ status?: number; message: string; url: string } | null>(null)
  const ext = fileName.split('.').pop()?.toLowerCase()

  useEffect(() => {
    if (ext === 'svg') { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const isProxy = url.includes('/p/')
        console.log('[OpenListPreview] fetch', isProxy ? 'PROXY' : 'DIRECT', url)
        let res = await fetch(url, { headers, redirect: 'follow' })
        if (!res.ok && isProxy) {
          // /p/ 失败，fallback /d/
          const directUrl = url.replace('/p/', '/d/')
          console.log('[OpenListPreview] fallback DIRECT', directUrl)
          res = await fetch(directUrl, { headers, redirect: 'follow' })
          if (!cancelled && res.ok) setErrorInfo(null)
        }
        if (!res.ok) {
          let msg = ''
          try { msg = (await res.text()).slice(0, 200) } catch {}
          if (!cancelled) { setErrorInfo({ status: res.status, message: msg || res.statusText, url }); setLoading(false) }
          return
        }
        const blob = await res.blob()
        const reader = new FileReader()
        reader.onload = () => { if (!cancelled) { setDataUri(reader.result as string); setLoading(false) } }
        reader.onerror = () => { if (!cancelled) { setErrorInfo({ message: '读取数据失败', url }); setLoading(false) } }
        reader.readAsDataURL(blob)
      } catch (e: any) {
        if (!cancelled) { setErrorInfo({ message: e?.message ?? '网络错误', url }); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [url, JSON.stringify(headers)])

  if (ext === 'svg') {
    return (
      <View style={styles.center}>
        <Icon name="fileImage" size={64} color="#999" />
        <Text style={{ color: '#999', marginTop: 8, fontSize: 13 }}>暂不支持 SVG 预览</Text>
      </View>
    )
  }
  if (errorInfo) {
    const is401 = errorInfo.status === 401
    return (
      <View style={styles.center}>
        <Icon name="fileImage" size={64} color="#999" />
        <Text style={{ color: '#999', marginTop: 8, fontSize: 14 }}>加载图片失败</Text>
        <Text style={{ color: '#666', marginTop: 6, fontSize: 12 }}>{errorInfo.status ? `HTTP ${errorInfo.status}` : ''}{errorInfo.message ? ` · ${errorInfo.message.slice(0, 80)}` : ''}</Text>
        <Text style={{ color: '#666', marginTop: 4, fontSize: 11 }} numberOfLines={1}>{errorInfo.url}</Text>
        {is401 && onReLogin ? (
          <TouchableOpacity onPress={onReLogin} style={[styles.downloadBtn, { backgroundColor: '#2196f3' }]}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>重新登录</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    )
  }
  return (
    <View style={[styles.center, { backgroundColor: '#000' }]}>
      {loading && <ActivityIndicator size="large" color="#fff" />}
      {dataUri ? (
        <Image
          source={{ uri: dataUri }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
        />
      ) : null}
    </View>
  )
}

function VideoViewer({ url, headers }: { url: string; headers: Record<string, string> }) {
  const player = useVideoPlayer({ uri: url, headers })
  return (
    <View style={[styles.mediaContainer, { backgroundColor: '#000' }]}>
      <VideoView
        player={player}
        style={styles.mediaPlayer}
        allowsPictureInPicture
      />
    </View>
  )
}

function AudioViewer({ url, headers, t }: { url: string; headers: Record<string, string>; t: any }) {
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
    const sub = (player as any).addListener?.('playbackStatusUpdate', (status: any) => {
      if (typeof status.currentTime === 'number') setCurrentTime(status.currentTime)
      if (typeof status.duration === 'number') setDuration(status.duration)
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
    if (doSeek) player.seekTo(ratio * duration)
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

function TextViewer({ url, headers, t }: { url: string; headers: Record<string, string>; t: any }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorInfo, setErrorInfo] = useState<{ status?: number; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const isProxy = url.includes('/p/')
        let res = await fetch(url, { headers, redirect: 'follow' })
        if (!res.ok && isProxy) {
          const directUrl = url.replace('/p/', '/d/')
          res = await fetch(directUrl, { headers, redirect: 'follow' })
        }
        if (!res.ok) {
          let msg = ''
          try { msg = (await res.text()).slice(0, 200) } catch {}
          if (!cancelled) { setErrorInfo({ status: res.status, message: msg || res.statusText }); setLoading(false) }
          return
        }
        const buf = await res.arrayBuffer()
        const decoded = decodeTextBuffer(buf)
        if (!cancelled) setText(decoded)
      } catch (e: any) {
        if (!cancelled) setErrorInfo({ message: e?.message ?? '加载失败' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [url, JSON.stringify(headers)])

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={t.primary} /></View>
  if (errorInfo) return (
    <View style={styles.center}>
      <Text style={{ color: '#999' }}>加载失败</Text>
      <Text style={{ color: '#666', marginTop: 6, fontSize: 12 }}>{errorInfo.status ? `HTTP ${errorInfo.status}` : ''}{errorInfo.message ? ` · ${errorInfo.message.slice(0, 80)}` : ''}</Text>
    </View>
  )
  return (
    <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
      <Text style={[styles.contentText, { color: t.text }]} selectable>{text}</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  headerTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  headerTitleText: { fontSize: 16, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollArea: { flex: 1 },
  scrollContent: { padding: 16 },
  contentText: { fontSize: 14, lineHeight: 22 },
  mediaContainer: { flex: 1 },
  mediaPlayer: { flex: 1 },
  audioContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  audioPlayBtn: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginVertical: 24 },
  audioProgressWrap: { width: '100%', paddingVertical: 12, marginTop: 4 },
  audioProgressTrack: { height: 4, backgroundColor: '#333', borderRadius: 2, justifyContent: 'center' },
  audioProgressBar: { height: '100%', borderRadius: 2 },
  audioThumb: { width: 14, height: 14, borderRadius: 7, position: 'absolute', marginLeft: -7, top: -5 },
  audioTime: { marginTop: 12, fontSize: 13 },
  downloadBtn: { marginTop: 18, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 },
})