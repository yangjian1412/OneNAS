import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet, Switch } from 'react-native'
import { useTheme } from '@/lib/theme'
import { useNavidromePlaybackStore } from '@/stores/navidromePlaybackStore'

interface Props {
  visible: boolean
  onClose: () => void
  showLyrics: boolean
}

export default function NavidromeSettings({ visible, onClose, showLyrics }: Props) {
  const t = useTheme()
  const prefs = useNavidromePlaybackStore()

  if (!visible) return null

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: t.bg, paddingTop: 40 }]}>
        <View style={[styles.header, { backgroundColor: t.headerBg, borderBottomColor: t.border }]}>
          <Text style={[styles.title, { color: t.text }]}>{showLyrics ? '歌词设置' : '常用设置'}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: t.primary, fontSize: 16 }}>关闭</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {showLyrics ? <LyricsContent prefs={prefs as any} t={t} /> : <CommonContent prefs={prefs as any} t={t} />}
        </ScrollView>
      </View>
    </Modal>
  )
}

function CommonContent({ prefs, t }: { prefs: any; t: any }) {
  return (
    <>
      <SectionLabel text="首页模块" />
      <Row label="最近播放" value={prefs.showRecentAlbums} onValueChange={prefs.setShowRecentAlbums} t={t} />
      <Row label="最常播放" value={prefs.showMostPlayed} onValueChange={prefs.setShowMostPlayed} t={t} />
      <Row label="最近添加" value={prefs.showFreshAlbums} onValueChange={prefs.setShowFreshAlbums} t={t} />
      <Row label="收藏" value={prefs.showStarred} onValueChange={prefs.setShowStarred} t={t} />
      <Row label="音乐文件夹" value={prefs.showMusicFolders} onValueChange={prefs.setShowMusicFolders} t={t} />
      <Row label="播放列表" value={prefs.showPlaylists} onValueChange={prefs.setShowPlaylists} t={t} />

      <SectionLabel text="缓存" />
      <Row label="缓存歌曲" value={prefs.cacheSongs} onValueChange={prefs.setCacheSongs} hint="让离线播放更流畅" t={t} />
      {prefs.cacheSongs && (
        <View style={[styles.row, { borderBottomColor: t.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: t.text }]}>最大缓存</Text>
            <Text style={[styles.hint, { color: t.textMuted }]}>{prefs.maxCacheMB} MB</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => prefs.setMaxCacheMB(Math.max(100, prefs.maxCacheMB - 100))} style={styles.btn}>
              <Text style={{ color: t.primary, fontSize: 14 }}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => prefs.setMaxCacheMB(Math.min(2000, prefs.maxCacheMB + 100))} style={[styles.btn, { marginLeft: 8 }]}>
              <Text style={{ color: t.primary, fontSize: 14 }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  )
}

function LyricsContent({ prefs, t }: { prefs: any; t: any }) {
  return (
    <>
      <SectionLabel text="歌词显示" />
      <Row label="通知栏歌词" value={prefs.lyricNotification} onValueChange={prefs.setLyricNotification} hint="在通知栏显示歌词" t={t} />
      <Row label="桌面歌词" value={prefs.lyricDesktop} onValueChange={prefs.setLyricDesktop} hint="在屏幕上方浮层显示歌词" t={t} />
      <Row label="注入系统" value={prefs.lyricInjectSystem} onValueChange={prefs.setLyricInjectSystem} hint="将歌词注入系统界面" t={t} />

      {prefs.lyricDesktop && (
        <>
          <SectionLabel text="桌面歌词外观" />
          <View style={[styles.row, { borderBottomColor: t.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: t.text }]}>歌词字号</Text>
              <Text style={[styles.hint, { color: t.textMuted }]}>{prefs.lyricFontSize}pt</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => prefs.setLyricFontSize(Math.max(14, prefs.lyricFontSize - 2))} style={styles.btn}>
                <Text style={{ color: t.primary, fontSize: 14 }}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => prefs.setLyricFontSize(Math.min(48, prefs.lyricFontSize + 2))} style={[styles.btn, { marginLeft: 8 }]}>
                <Text style={{ color: t.primary, fontSize: 14 }}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.row, { borderBottomColor: t.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: t.text }]}>不透明度</Text>
              <Text style={[styles.hint, { color: t.textMuted }]}>{Math.round(prefs.lyricOpacity * 100)}%</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {[50, 70, 85, 100].map((v) => (
                <TouchableOpacity
                  key={v}
                  onPress={() => prefs.setLyricOpacity(v / 100)}
                  style={[
                    styles.chipSmall,
                    { backgroundColor: Math.round(prefs.lyricOpacity * 100) === v ? t.primary : t.inputBg },
                  ]}
                >
                  <Text style={{ color: Math.round(prefs.lyricOpacity * 100) === v ? '#fff' : t.text, fontSize: 11 }}>
                    {v}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.row, { borderBottomColor: t.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: t.text }]}>Y 轴位置</Text>
              <Text style={[styles.hint, { color: t.textMuted }]}>桌面歌词垂直位置</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {(['top', 'middle', 'bottom'] as const).map((pos) => (
                <TouchableOpacity
                  key={pos}
                  onPress={() => prefs.setLyricPosition(pos)}
                  style={[styles.chipSmall, { marginLeft: pos !== 'top' ? 4 : 0, backgroundColor: prefs.lyricPosition === pos ? t.primary : t.inputBg }]}
                >
                  <Text style={{ color: prefs.lyricPosition === pos ? '#fff' : t.text, fontSize: 11 }}>
                    {pos === 'top' ? '顶部' : pos === 'middle' ? '中部' : '底部'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Row label="锁屏显示" value={prefs.lyricShowOnLockScreen} onValueChange={prefs.setLyricShowOnLockScreen} hint="锁屏状态下继续显示桌面歌词" t={t} />
        </>
      )}
    </>
  )
}

function SectionLabel({ text }: { text: string }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.6 }}>
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
