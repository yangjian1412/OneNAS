import { useState } from 'react'
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet, Switch, Alert, NativeModules, ToastAndroid } from 'react-native'
import { useTheme } from '@/lib/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavidromePlaybackStore } from '@/stores/navidromePlaybackStore'
import { setDesktopLyricsPosition } from '@/lib/lyricsDisplay'

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

const COLOR_PRESETS = [
  { label: '白', rgb: 0xFFFFFF },
  { label: '黑', rgb: 0x000000 },
  { label: '蓝', rgb: 0x4A90E2 },
  { label: '绿', rgb: 0x4CAF50 },
  { label: '黄', rgb: 0xFFC107 },
  { label: '红', rgb: 0xE57373 },
]

const POSITION_PRESETS: Array<{ label: string; value: 'top' | 'middle' | 'bottom' }> = [
  { label: '顶部', value: 'top' },
  { label: '中部', value: 'middle' },
  { label: '底部', value: 'bottom' },
]

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
        hint="在系统通知栏显示歌词（独立通道）"
        t={t}
      />
      {lyricNotification && <NotificationSubConfig t={t} />}

      <Row
        label="桌面歌词"
        value={lyricDesktop}
        onValueChange={(v) => handleToggleDesktop(v, setLyricDesktop)}
        hint="浮动显示在屏幕顶部，可拖动"
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

function NotificationSubConfig({ t }: { t: any }) {
  const lyricLineCount = useNavidromePlaybackStore((s) => s.lyricLineCount)
  const setLyricLineCount = useNavidromePlaybackStore((s) => s.setLyricLineCount)

  return (
    <>
      <View style={[styles.row, { borderBottomColor: t.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: t.text }]}>显示行数</Text>
          <Text style={[styles.hint, { color: t.textMuted }]}>1=仅当前  2=+后1  3=+前1  4=+后2</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {([1, 2, 3, 4] as const).map((n, i) => (
            <TouchableOpacity
              key={n}
              onPress={() => setLyricLineCount(n)}
              style={[styles.chipSmall, { marginLeft: i > 0 ? 4 : 0, backgroundColor: lyricLineCount === n ? t.primary : t.inputBg }]}
            >
              <Text style={{ color: lyricLineCount === n ? '#fff' : t.text, fontSize: 11 }}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
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
  const lyricPosition = useNavidromePlaybackStore((s) => s.lyricPosition)
  const setLyricPosition = useNavidromePlaybackStore((s) => s.setLyricPosition)
  const lyricDesktopPositionY = useNavidromePlaybackStore((s) => s.lyricDesktopPositionY)
  const setLyricDesktopPositionY = useNavidromePlaybackStore((s) => s.setLyricDesktopPositionY)
  const lyricDesktopFontSize = useNavidromePlaybackStore((s) => s.lyricDesktopFontSize)
  const setLyricDesktopFontSize = useNavidromePlaybackStore((s) => s.setLyricDesktopFontSize)
  const lyricLineCount = useNavidromePlaybackStore((s) => s.lyricLineCount)
  const setLyricLineCount = useNavidromePlaybackStore((s) => s.setLyricLineCount)

  return (
    <>
      <View style={[styles.row, { borderBottomColor: t.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: t.text }]}>字号</Text>
          <Text style={[styles.hint, { color: t.textMuted }]}>{lyricDesktopFontSize}sp</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => setLyricDesktopFontSize(Math.max(14, lyricDesktopFontSize - 2))} style={styles.btn}>
            <Text style={{ color: t.primary, fontSize: 14 }}>−</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setLyricDesktopFontSize(Math.min(48, lyricDesktopFontSize + 2))} style={[styles.btn, { marginLeft: 8 }]}>
            <Text style={{ color: t.primary, fontSize: 14 }}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.row, { borderBottomColor: t.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: t.text }]}>显示行数</Text>
          <Text style={[styles.hint, { color: t.textMuted }]}>桌面歌词显示 1~4 行</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {([1, 2, 3, 4] as const).map((n, i) => (
            <TouchableOpacity
              key={n}
              onPress={() => setLyricLineCount(n)}
              style={[styles.chipSmall, { marginLeft: i > 0 ? 4 : 0, backgroundColor: lyricLineCount === n ? t.primary : t.inputBg }]}
            >
              <Text style={{ color: lyricLineCount === n ? '#fff' : t.text, fontSize: 11 }}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={[styles.row, { borderBottomColor: t.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: t.text }]}>对齐</Text>
          <Text style={[styles.hint, { color: t.textMuted }]}>桌面歌词水平对齐</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {(['left', 'center', 'right'] as const).map((a, i) => (
            <TouchableOpacity
              key={a}
              onPress={() => setLyricAlignment(a)}
              style={[styles.chipSmall, { marginLeft: i > 0 ? 4 : 0, backgroundColor: lyricAlignment === a ? t.primary : t.inputBg }]}
            >
              <Text style={{ color: lyricAlignment === a ? '#fff' : t.text, fontSize: 11 }}>
                {a === 'left' ? '左' : a === 'center' ? '中' : '右'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={[styles.row, { borderBottomColor: t.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: t.text }]}>文字颜色</Text>
          <Text style={[styles.hint, { color: t.textMuted }]}>透明度受下方“不透明度”控制</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', maxWidth: 200, gap: 6 }}>
          {COLOR_PRESETS.map((c) => (
            <TouchableOpacity
              key={c.label}
              onPress={() => setLyricColor(c.rgb)}
              style={[
                styles.chipSmall,
                {
                  backgroundColor: lyricColor === c.rgb ? t.primary : t.inputBg,
                  borderWidth: lyricColor === c.rgb ? 2 : 0,
                  borderColor: t.primary,
                },
              ]}
            >
              <Text style={{ color: lyricColor === c.rgb ? '#fff' : t.text, fontSize: 11 }}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

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

      <View style={[styles.row, { borderBottomColor: t.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: t.text }]}>Y 轴位置</Text>
          <Text style={[styles.hint, { color: t.textMuted }]}>
            预设位置或拖动桌面歌词保存（当前距底部 {lyricDesktopPositionY}px）
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {POSITION_PRESETS.map((p, i) => (
            <TouchableOpacity
              key={p.value}
              onPress={() => {
                setLyricPosition(p.value)
                if (p.value === 'top') setLyricDesktopPositionY(0)
              }}
              style={[styles.chipSmall, { marginLeft: i > 0 ? 4 : 0, backgroundColor: lyricPosition === p.value ? t.primary : t.inputBg }]}
            >
              <Text style={{ color: lyricPosition === p.value ? '#fff' : t.text, fontSize: 11 }}>{p.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => {
              setLyricDesktopPositionY(0)
              setDesktopLyricsPosition(0)
            }}
            style={[styles.chipSmall, { marginLeft: 4, backgroundColor: t.inputBg }]}
          >
            <Text style={{ color: t.text, fontSize: 11 }}>重置</Text>
          </TouchableOpacity>
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