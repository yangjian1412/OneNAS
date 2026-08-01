import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet, Switch, Alert, NativeModules, ToastAndroid, PanResponder } from 'react-native'
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg'
import { useTheme } from '@/lib/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavidromePlaybackStore } from '@/stores/navidromePlaybackStore'

interface Props {
  visible: boolean
  onClose: () => void
  showLyrics: boolean
}

const { PackageManagerModule } = NativeModules as {
  PackageManagerModule?: {
    isOverlayGranted: () => Promise<boolean>
    openOverlaySettings: () => Promise<boolean>
    isNotificationPermissionGranted: () => Promise<boolean>
    openAppNotificationSettings: () => Promise<boolean>
  }
}

function rgbToHex(rgb: number): string {
  return '#' + ((rgb & 0xffffff) >>> 0).toString(16).padStart(6, '0').toUpperCase()
}

const COLOR_STOPS: Array<{ t: number; r: number; g: number; b: number }> = [
  { t: 0, r: 255, g: 255, b: 255 },
  { t: 0.143, r: 255, g: 0, b: 0 },
  { t: 0.286, r: 255, g: 255, b: 0 },
  { t: 0.429, r: 0, g: 255, b: 0 },
  { t: 0.571, r: 0, g: 255, b: 255 },
  { t: 0.714, r: 0, g: 0, b: 255 },
  { t: 0.857, r: 255, g: 0, b: 255 },
  { t: 1, r: 0, g: 0, b: 0 },
]

function gradientColor(t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  let i = 0
  while (i < COLOR_STOPS.length - 2 && clamped > COLOR_STOPS[i + 1].t) i++
  const a = COLOR_STOPS[i]
  const b = COLOR_STOPS[i + 1]
  const span = Math.max(1e-6, b.t - a.t)
  const f = Math.max(0, Math.min(1, (clamped - a.t) / span))
  const r = Math.round(a.r + (b.r - a.r) * f)
  const g = Math.round(a.g + (b.g - a.g) * f)
  const bl = Math.round(a.b + (b.b - a.b) * f)
  return (r << 16) | (g << 8) | bl
}

function tForColor(rgb: number): number {
  const r = (rgb >> 16) & 0xff
  const g = (rgb >> 8) & 0xff
  const b = rgb & 0xff
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i <= 360; i++) {
    const t = i / 360
    const c = gradientColor(t)
    const dr = ((c >> 16) & 0xff) - r
    const dg = ((c >> 8) & 0xff) - g
    const db = (c & 0xff) - b
    const d = dr * dr + dg * dg + db * db
    if (d < bestDist) {
      bestDist = d
      best = t
    }
  }
  return best
}

function HueSlider({ value, onChange }: { value: number; onChange: (rgb: number) => void }) {
  const [trackW, setTrackW] = useState(0)
  const trackWRef = useRef(0)
  const viewLeftRef = useRef(0)
  const draggingRef = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [pos, setPos] = useState(() => tForColor(value))
  const THUMB = 20

  useEffect(() => {
    if (!draggingRef.current) setPos(tForColor(value))
  }, [value])

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        draggingRef.current = true
        viewLeftRef.current = e.nativeEvent.pageX - e.nativeEvent.locationX
        updateFromX(e.nativeEvent.pageX - viewLeftRef.current)
      },
      onPanResponderMove: (e) => updateFromX(e.nativeEvent.pageX - viewLeftRef.current),
      onPanResponderRelease: () => {
        draggingRef.current = false
      },
      onPanResponderTerminate: () => {
        draggingRef.current = false
      },
    }),
  ).current

  function updateFromX(x: number) {
    const w = trackWRef.current
    if (w <= 0) return
    const p = Math.max(0, Math.min(1, x / w))
    setPos(p)
    onChangeRef.current(gradientColor(p))
  }

  const thumbX = trackW > 0 ? pos * trackW : 0

  return (
    <View
      style={{ marginTop: 10, height: 24, justifyContent: 'center' }}
      onLayout={(e) => {
        trackWRef.current = e.nativeEvent.layout.width
        setTrackW(e.nativeEvent.layout.width)
      }}
      {...pan.panHandlers}
    >
      {trackW > 0 && (
        <>
          <Svg width={trackW} height={12} style={{ borderRadius: 6, overflow: 'hidden' }}>
            <Defs>
              <LinearGradient id="hueGrad" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0%" stopColor="#FFFFFF" />
                <Stop offset="14%" stopColor="#FF0000" />
                <Stop offset="29%" stopColor="#FFFF00" />
                <Stop offset="43%" stopColor="#00FF00" />
                <Stop offset="57%" stopColor="#00FFFF" />
                <Stop offset="71%" stopColor="#0000FF" />
                <Stop offset="86%" stopColor="#FF00FF" />
                <Stop offset="100%" stopColor="#000000" />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={trackW} height={12} rx={6} fill="url(#hueGrad)" />
          </Svg>
          <View
            style={{
              position: 'absolute',
              top: 2,
              left: Math.max(0, Math.min(trackW - THUMB, thumbX - THUMB / 2)),
              width: THUMB,
              height: THUMB,
              borderRadius: THUMB / 2,
              backgroundColor: '#fff',
              borderWidth: 2,
              borderColor: '#333',
            }}
          />
        </>
      )}
    </View>
  )
}

export default function NavidromeSettings({ visible, onClose, showLyrics }: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()

  if (!visible) return null

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: t.bg, paddingTop: 40, paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { backgroundColor: t.headerBg, borderBottomColor: t.border }]}>
          <Text style={[styles.title, { color: t.text }]}>{showLyrics ? '歌词设置' : '常用设置'}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: t.primary, fontSize: 16 }}>关闭</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {showLyrics ? <LyricsContent t={t} /> : <CommonContent t={t} />}
        </ScrollView>
      </View>
    </Modal>
  )
}

function CommonContent({ t }: { t: any }) {
  const showRecentAlbums = useNavidromePlaybackStore((s) => s.showRecentAlbums)
  const setShowRecentAlbums = useNavidromePlaybackStore((s) => s.setShowRecentAlbums)
  const showMostPlayed = useNavidromePlaybackStore((s) => s.showMostPlayed)
  const setShowMostPlayed = useNavidromePlaybackStore((s) => s.setShowMostPlayed)
  const showFreshAlbums = useNavidromePlaybackStore((s) => s.showFreshAlbums)
  const setShowFreshAlbums = useNavidromePlaybackStore((s) => s.setShowFreshAlbums)
  const showStarred = useNavidromePlaybackStore((s) => s.showStarred)
  const setShowStarred = useNavidromePlaybackStore((s) => s.setShowStarred)
  const showPlaylists = useNavidromePlaybackStore((s) => s.showPlaylists)
  const setShowPlaylists = useNavidromePlaybackStore((s) => s.setShowPlaylists)
  const showPlayCount = useNavidromePlaybackStore((s) => s.showPlayCount)
  const setShowPlayCount = useNavidromePlaybackStore((s) => s.setShowPlayCount)
  const cacheSongs = useNavidromePlaybackStore((s) => s.cacheSongs)
  const setCacheSongs = useNavidromePlaybackStore((s) => s.setCacheSongs)
  const maxCacheMB = useNavidromePlaybackStore((s) => s.maxCacheMB)
  const setMaxCacheMB = useNavidromePlaybackStore((s) => s.setMaxCacheMB)

  return (
    <>
      <SectionLabel text="首页模块" t={t} />
      <Row label="最近播放" value={showRecentAlbums} onValueChange={setShowRecentAlbums} t={t} />
      <Row label="最常播放" value={showMostPlayed} onValueChange={setShowMostPlayed} t={t} />
      <Row label="最近添加" value={showFreshAlbums} onValueChange={setShowFreshAlbums} t={t} />
      <Row label="收藏" value={showStarred} onValueChange={setShowStarred} t={t} />
      <Row label="播放列表" value={showPlaylists} onValueChange={setShowPlaylists} t={t} />

      <SectionLabel text="列表" t={t} />
      <Row label="歌曲播放次数" value={showPlayCount} onValueChange={setShowPlayCount} hint="在歌曲/专辑列表中显示播放次数" t={t} />

      <SectionLabel text="缓存" t={t} />
      <Row label="缓存歌曲" value={cacheSongs} onValueChange={setCacheSongs} hint="让离线播放更流畅" t={t} />
      {cacheSongs && (
        <View style={[styles.row, { borderBottomColor: t.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: t.text }]}>最大缓存</Text>
            <Text style={[styles.hint, { color: t.textMuted }]}>{maxCacheMB} MB</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setMaxCacheMB(Math.max(100, maxCacheMB - 100))} style={styles.btn}>
              <Text style={{ color: t.primary, fontSize: 14 }}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMaxCacheMB(Math.min(2000, maxCacheMB + 100))} style={[styles.btn, { marginLeft: 8 }]}>
              <Text style={{ color: t.primary, fontSize: 14 }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  )
}

function LyricsContent({ t }: { t: any }) {
  const lyricNotification = useNavidromePlaybackStore((s) => s.lyricNotification)
  const setLyricNotification = useNavidromePlaybackStore((s) => s.setLyricNotification)
  const lyricDesktop = useNavidromePlaybackStore((s) => s.lyricDesktop)
  const setLyricDesktop = useNavidromePlaybackStore((s) => s.setLyricDesktop)
  const lyricInjectSystem = useNavidromePlaybackStore((s) => s.lyricInjectSystem)
  const setLyricInjectSystem = useNavidromePlaybackStore((s) => s.setLyricInjectSystem)

  return (
    <>
      <SectionLabel text="歌词显示" t={t} />

      <Row
        label="通知栏歌词"
        value={lyricNotification}
        onValueChange={(v) => handleToggleNotification(v, setLyricNotification)}
        hint="在系统通知栏显示歌词（始终四行：上一句/当前/下一句/下两句）"
        t={t}
      />

      <Row
        label="桌面歌词"
        value={lyricDesktop}
        onValueChange={(v) => handleToggleDesktop(v, setLyricDesktop)}
        hint="浮动显示在屏幕底部，可拖动调整位置"
        t={t}
      />
      {lyricDesktop && <DesktopSubConfig t={t} />}

      <Row
        label="系统播放器歌词"
        value={lyricInjectSystem}
        onValueChange={setLyricInjectSystem}
        hint="将当前歌词注入系统媒体会话（锁屏/通知栏媒体/Dynamic Island 显示）"
        t={t}
      />
    </>
  )
}

function DesktopSubConfig({ t }: { t: any }) {
  const lyricOpacity = useNavidromePlaybackStore((s) => s.lyricOpacity)
  const setLyricOpacity = useNavidromePlaybackStore((s) => s.setLyricOpacity)
  const lyricAlignment = useNavidromePlaybackStore((s) => s.lyricAlignment)
  const setLyricAlignment = useNavidromePlaybackStore((s) => s.setLyricAlignment)
  const lyricColor = useNavidromePlaybackStore((s) => s.lyricColor)
  const setLyricColor = useNavidromePlaybackStore((s) => s.setLyricColor)
  const lyricDesktopSwapOrder = useNavidromePlaybackStore((s) => s.lyricDesktopSwapOrder)
  const setLyricDesktopSwapOrder = useNavidromePlaybackStore((s) => s.setLyricDesktopSwapOrder)

  return (
    <>
      <View style={[styles.row, { borderBottomColor: t.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: t.text }]}>对齐</Text>
          <Text style={[styles.hint, { color: t.textMuted }]}>左右：第一句靠左、第二句靠右</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {(['left', 'center', 'right', 'split'] as const).map((a, i) => (
            <TouchableOpacity
              key={a}
              onPress={() => setLyricAlignment(a)}
              style={[styles.chipSmall, { marginLeft: i > 0 ? 4 : 0, backgroundColor: lyricAlignment === a ? t.primary : t.inputBg }]}
            >
              <Text style={{ color: lyricAlignment === a ? '#fff' : t.text, fontSize: 11 }}>
                {a === 'left' ? '左' : a === 'center' ? '中' : a === 'right' ? '右' : '左右'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={[styles.row, { flexDirection: 'column', alignItems: 'stretch', borderBottomColor: t.border }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: t.text }]}>文字颜色</Text>
            <Text style={[styles.hint, { color: t.textMuted }]}>拖动进度条选择颜色（透明度受下方“不透明度”控制）</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: rgbToHex(lyricColor),
                borderWidth: 1,
                borderColor: t.border,
              }}
            />
            <Text style={{ color: t.textMuted, fontSize: 11 }}>{rgbToHex(lyricColor)}</Text>
          </View>
        </View>
        <HueSlider value={lyricColor} onChange={setLyricColor} />
      </View>

      <Row
        label="交换显示顺序"
        value={lyricDesktopSwapOrder}
        onValueChange={setLyricDesktopSwapOrder}
        hint="打开后第一句显示当前句、第二句显示下一句"
        t={t}
      />

      <View style={[styles.row, { borderBottomColor: t.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: t.text }]}>不透明度</Text>
          <Text style={[styles.hint, { color: t.textMuted }]}>{Math.round(lyricOpacity * 100)}%（同时控制背景与文字）</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {[50, 70, 85, 100].map((v) => (
            <TouchableOpacity
              key={v}
              onPress={() => setLyricOpacity(v / 100)}
              style={[
                styles.chipSmall,
                { backgroundColor: Math.round(lyricOpacity * 100) === v ? t.primary : t.inputBg },
              ]}
            >
              <Text style={{ color: Math.round(lyricOpacity * 100) === v ? '#fff' : t.text, fontSize: 11 }}>
                {v}%
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </>
  )
}

async function handleToggleDesktop(next: boolean, set: (v: boolean) => void) {
  if (!next) {
    set(false)
    return
  }
  try {
    const granted = await PackageManagerModule?.isOverlayGranted()
    if (granted) {
      set(true)
      toast('桌面歌词已开启')
      return
    }
    Alert.alert(
      '需要悬浮窗权限',
      '桌面歌词需要“显示在其他应用上方”权限才能浮动显示。',
      [
        { text: '取消', style: 'cancel', onPress: () => set(false) },
        { text: '去设置', onPress: () => { PackageManagerModule?.openOverlaySettings(); set(true) } },
      ],
    )
  } catch {
    set(true)
  }
}

async function handleToggleNotification(next: boolean, set: (v: boolean) => void) {
  if (!next) {
    set(false)
    return
  }
  try {
    const granted = await PackageManagerModule?.isNotificationPermissionGranted()
    if (granted) {
      set(true)
      toast('通知栏歌词已开启，请在通知栏下拉查看')
      return
    }
    Alert.alert(
      '需要通知权限',
      '通知栏歌词需要“通知”权限才能显示。',
      [
        { text: '取消', style: 'cancel', onPress: () => set(false) },
        { text: '去设置', onPress: () => { PackageManagerModule?.openAppNotificationSettings(); set(true) } },
      ],
    )
  } catch {
    set(true)
  }
}

function toast(msg: string) {
  ToastAndroid.show(msg, ToastAndroid.SHORT)
}

function SectionLabel({ text, t }: { text: string; t: any }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.6, color: t.text }}>
        {text}
      </Text>
    </View>
  )
}

function Row({ label, value, onValueChange, hint, t }: { label: string; value: boolean; onValueChange: (v: boolean) => void; hint?: string; t: any }) {
  return (
    <View style={[styles.row, { borderBottomColor: t.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: t.text }]}>{label}</Text>
        {hint && <Text style={[styles.hint, { color: t.textMuted }]}>{hint}</Text>}
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontWeight: '700' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 15, fontWeight: '500' },
  hint: { fontSize: 11, marginTop: 2 },
  btn: {
    width: 36, height: 32, borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#8884',
    alignItems: 'center', justifyContent: 'center',
  },
  chipSmall: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, minWidth: 36, alignItems: 'center' },
})