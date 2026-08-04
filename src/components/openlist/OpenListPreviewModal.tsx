import { useEffect, useState, useRef } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Image, Pressable, PanResponder, Alert, StyleSheet, Platform, StatusBar } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { VideoView, useVideoPlayer } from 'expo-video'
import { useAudioPlayer } from 'expo-audio'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import { getFileCategory } from '@/lib/fileTypes'
import { openListResolveFileUrl, type OpenListResolvedFile } from '@/lib/api/openlist'
import type { OpenListFile, OpenListServerConfig } from '@/types'

interface Props {
  visible: boolean
  file: OpenListFile | null
  /** 由列表页计算好的完整路径（fs/list 项可能不带 path/virtual_path，需用当前目录兜底拼接） */
  filePath?: string
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

export default function OpenListPreviewModal({ visible, file, filePath: filePathProp, server, onClose, onDownload, onReLogin }: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const filePath = filePathProp ?? file?.virtual_path ?? file?.path ?? ''
  const category = file ? getFileCategory(file.name) : 'other'
  const [resolved, setResolved] = useState<OpenListResolvedFile | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible || !file || !filePath) {
      setResolved(null)
      setResolveError(null)
      return
    }
    let cancelled = false
    console.error('[OpenListPreview] resolve start', filePath)
    ;(async () => {
      try {
        const r = await openListResolveFileUrl(server, filePath)
        if (!cancelled) {
          setResolved(r)
          setResolveError(null)
          console.error('[OpenListPreview] resolved', {
            kind: r.rawUrl ? 'raw_url' : (r.url === r.proxyUrl ? 'proxy' : 'direct'),
            url: r.url,
          })
        }
      } catch (e: any) {
        if (!cancelled) {
          setResolveError(e?.message ?? '解析失败')
          setResolved(null)
        }
      }
    })()
    return () => { cancelled = true }
  }, [visible, file?.path, file?.virtual_path, filePath, filePathProp, server.url, server.token])

  const copyUrl = async () => {
    if (!resolved) return
    try {
      const text = [
        `推荐: ${resolved.url}`,
        resolved.rawUrl ? `raw_url: ${resolved.rawUrl}` : null,
        `proxy: ${resolved.proxyUrl}`,
        `direct: ${resolved.directUrl}`,
      ].filter(Boolean).join('\n')
      await Clipboard.setStringAsync(text)
      Alert.alert('已复制', '多个 URL 已复制')
    } catch {
      Alert.alert('复制失败', '请稍后再试')
    }
  }

  const source = resolved?.url ?? ''

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

        {!file ? null : !resolved && !resolveError ? (
          <View style={styles.center}><ActivityIndicator size="large" color={t.primary} /></View>
        ) : !resolved ? (
          <View style={styles.center}>
            <Icon name="fileImage" size={64} color="#999" />
            <Text style={{ color: '#999', marginTop: 12, fontSize: 14 }}>无法解析文件 URL</Text>
            <Text style={{ color: '#666', marginTop: 6, fontSize: 12 }}>{resolveError}</Text>
          </View>
        ) : category === 'image' ? (
          <ImageViewer url={source} fallback={resolved.directUrl} authHeader={server.token ?? ''} alistHost={server.url} fileName={file.name} onReLogin={onReLogin} />
        ) : category === 'video' ? (
          <VideoViewer url={source} fallback={resolved.directUrl} authHeader={server.token ?? ''} alistHost={server.url} />
        ) : category === 'audio' ? (
          <AudioViewer url={source} fallback={resolved.directUrl} authHeader={server.token ?? ''} alistHost={server.url} t={t} />
        ) : category === 'text' ? (
          <TextViewer url={source} fallback={resolved.directUrl} authHeader={server.token ?? ''} alistHost={server.url} t={t} />
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

interface ViewerProps {
  url: string
  fallback?: string
  authHeader: string
  alistHost: string
}

const TIMEOUT_MS = 5000

function headersFor(url: string, authHeader: string, alistHost: string): Record<string, string> {
  // 与 aria2 一致：所有 URL 都带 Authorization。raw_url 是云存储预签名 URL，多一个 Authorization 通常无害；
  // 但 alist-managed URL（/d/、/p/）必须带 Authorization 才通过认证。aria2 用相同方式成功。
  const headers: Record<string, string> = {}
  if (authHeader) headers.Authorization = authHeader
  // 浏览器风格 UA，帮助云存储识别为浏览器请求
  headers['User-Agent'] = 'Mozilla/5.0 (Linux; Android) AppleWebKit/537.36'
  // Referer 用于 alist 防外链（如有）
  if (alistHost) headers.Referer = alistHost
  return headers
}

function timeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('FETCH_TIMEOUT')), ms))
}

async function fetchOne(url: string, authHeader: string, alistHost: string): Promise<{ res: Response | null; timedOut: boolean; errorMsg?: string }> {
  console.error('[OpenListPreview] fetch', url)
  try {
    const res = await Promise.race([
      fetch(url, { headers: headersFor(url, authHeader, alistHost), redirect: 'follow' }),
      timeoutPromise(TIMEOUT_MS),
    ])
    console.error('[OpenListPreview] fetch ok', url, res.status)
    return { res, timedOut: false }
  } catch (e: any) {
    const timedOut = e?.message === 'FETCH_TIMEOUT'
    const errorMsg = timedOut ? `请求超时 (${TIMEOUT_MS / 1000}s)` : (e?.message ?? '网络错误')
    console.error('[OpenListPreview] fetch error', url, errorMsg)
    return { res: null, timedOut, errorMsg }
  }
}

async function fetchWithFallback(urls: string[], authHeader: string, alistHost: string): Promise<{ res: Response | null; tried: string[]; timedOut: boolean; errorMsg?: string }> {
  const tried: string[] = []
  let lastError = ''
  let lastTimedOut = false
  for (const url of urls) {
    if (!url) continue
    tried.push(url)
    const { res, timedOut, errorMsg } = await fetchOne(url, authHeader, alistHost)
    if (res && res.ok) return { res, tried, timedOut: false }
    lastError = errorMsg ?? (res ? `HTTP ${res.status}` : '未知错误')
    lastTimedOut = timedOut || lastTimedOut
  }
  return { res: null, tried, timedOut: lastTimedOut, errorMsg: lastError }
}

function ImageViewer({ url, fallback, authHeader, alistHost, fileName, onReLogin }: ViewerProps & { fileName: string; onReLogin?: () => void }) {
  const [dataUri, setDataUri] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorInfo, setErrorInfo] = useState<{ status?: number; message: string; url: string; tried: string[]; timedOut?: boolean } | null>(null)
  const ext = fileName.split('.').pop()?.toLowerCase()

  useEffect(() => {
    if (ext === 'svg') { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const urls = [url, fallback].filter(Boolean) as string[]
        const { res, tried, timedOut, errorMsg } = await fetchWithFallback(urls, authHeader, alistHost)
        if (!res) {
          if (!cancelled) { setErrorInfo({ message: errorMsg || '加载失败', url, tried, timedOut }); setLoading(false) }
          return
        }
        if (!res.ok) {
          let msg = ''
          try { msg = (await res.text()).slice(0, 400) } catch {}
          if (!cancelled) {
            setErrorInfo({ status: res.status, message: msg || res.statusText || errorMsg || '', url: res.url || url, tried })
            setLoading(false)
          }
          return
        }
        const blob = await res.blob()
        const reader = new FileReader()
        reader.onload = () => { if (!cancelled) { setDataUri(reader.result as string); setLoading(false) } }
        reader.onerror = () => { if (!cancelled) { setErrorInfo({ message: '读取数据失败', url, tried }); setLoading(false) } }
        reader.readAsDataURL(blob)
      } catch (e: any) {
        if (!cancelled) { setErrorInfo({ message: e?.message ?? '网络错误', url, tried: [url] }); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [url, fallback, authHeader, alistHost])

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
      <ScrollView style={styles.errorScroll} contentContainerStyle={styles.errorContent}>
        <View style={styles.center}>
          <Icon name="fileImage" size={64} color="#999" />
          <Text style={{ color: '#999', marginTop: 8, fontSize: 14 }}>加载图片失败</Text>
          <Text style={{ color: '#666', marginTop: 6, fontSize: 12 }}>{errorInfo.status ? `HTTP ${errorInfo.status}` : ''}{errorInfo.message ? ` · ${errorInfo.message.replace(/<[^>]+>/g, ' ').slice(0, 120)}` : ''}</Text>
          <Text style={{ color: '#888', marginTop: 8, fontSize: 11 }} numberOfLines={2}>URL: {errorInfo.url}</Text>
          {errorInfo.tried.length > 1 ? (
            <Text style={{ color: '#888', marginTop: 4, fontSize: 11 }}>尝试了 {errorInfo.tried.length} 个 URL</Text>
          ) : null}
          {is401 && onReLogin ? (
            <TouchableOpacity onPress={onReLogin} style={[styles.downloadBtn, { backgroundColor: '#2196f3' }]}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>重新登录</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
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

function VideoViewer({ url, fallback, authHeader, alistHost }: ViewerProps) {
  const [workingUrl, setWorkingUrl] = useState(url)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (const u of [url, fallback].filter(Boolean) as string[]) {
        const { res, timedOut } = await fetchOne(u, authHeader, alistHost).then(r => ({ res: r.res, timedOut: r.timedOut }))
        if (res && res.ok && !cancelled) { setWorkingUrl(u); return }
        if (timedOut) break
      }
    })()
    return () => { cancelled = true }
  }, [url, fallback, authHeader, alistHost])
  const player = useVideoPlayer({ uri: workingUrl, headers: headersFor(workingUrl, authHeader, alistHost) })
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

function AudioViewer({ url, fallback, authHeader, alistHost, t }: ViewerProps & { t: any }) {
  const [workingUrl] = useState(url)
  const player = useAudioPlayer({ uri: workingUrl, headers: headersFor(workingUrl, authHeader, alistHost) })
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

function TextViewer({ url, fallback, authHeader, alistHost, t }: ViewerProps & { t: any }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorInfo, setErrorInfo] = useState<{ status?: number; message: string; url: string; tried: string[]; timedOut?: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const urls = [url, fallback].filter(Boolean) as string[]
        const { res, tried, timedOut, errorMsg } = await fetchWithFallback(urls, authHeader, alistHost)
        if (!res) {
          if (!cancelled) { setErrorInfo({ message: errorMsg || '加载失败', url, tried, timedOut }); setLoading(false) }
          return
        }
        if (!res.ok) {
          let msg = ''
          try { msg = (await res.text()).slice(0, 400) } catch {}
          if (!cancelled) {
            setErrorInfo({ status: res.status, message: msg || res.statusText || errorMsg || '', url: res.url || url, tried })
            setLoading(false)
          }
          return
        }
        const buf = await res.arrayBuffer()
        const decoded = decodeTextBuffer(buf)
        if (!cancelled) setText(decoded)
      } catch (e: any) {
        if (!cancelled) setErrorInfo({ message: e?.message ?? '加载失败', url, tried: [url] })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [url, fallback, authHeader, alistHost])

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={t.primary} /></View>
  if (errorInfo) return (
    <ScrollView style={styles.errorScroll} contentContainerStyle={styles.errorContent}>
      <View style={styles.center}>
        <Text style={{ color: '#999' }}>加载失败</Text>
        <Text style={{ color: '#666', marginTop: 6, fontSize: 12 }}>{errorInfo.status ? `HTTP ${errorInfo.status}` : ''}{errorInfo.message ? ` · ${errorInfo.message.replace(/<[^>]+>/g, ' ').slice(0, 120)}` : ''}</Text>
        <Text style={{ color: '#888', marginTop: 8, fontSize: 11 }} numberOfLines={2}>URL: {errorInfo.url}</Text>
      </View>
    </ScrollView>
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
  errorScroll: { flex: 1 },
  errorContent: { padding: 24, justifyContent: 'center', alignItems: 'center' },
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