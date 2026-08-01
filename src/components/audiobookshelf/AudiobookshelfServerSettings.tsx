import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native'
import { useTheme } from '@/lib/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { clearAudiobookshelfCache } from '@/lib/api/audiobookshelf'
import Icon from '@/components/Icon'

interface Props {
  visible: boolean
  onClose: () => void
  serverUrl?: string
  serverVersion?: string
  userName?: string
  onPlaybackSettings: () => void
}

export default function AudiobookshelfServerSettings({ visible, onClose, serverUrl, serverVersion, userName, onPlaybackSettings }: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  if (!visible) return null
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: t.bg, paddingTop: 40, paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { backgroundColor: t.headerBg, borderBottomColor: t.border }]}>
          <Text style={[styles.title, { color: t.text }]}>服务器设置</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: t.primary, fontSize: 16 }}>关闭</Text>
          </TouchableOpacity>
        </View>
        <View style={{ padding: 16 }}>
          <Text style={[styles.section, { color: t.textMuted }]}>服务器</Text>
          <Text style={[styles.url, { color: t.text }]} numberOfLines={2}>{serverUrl || '未连接'}</Text>
          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: t.textMuted }]}>用户</Text>
            <Text style={[styles.metaValue, { color: t.text }]}>{userName || '-'}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: t.textMuted }]}>服务器版本</Text>
            <Text style={[styles.metaValue, { color: t.text }]}>{serverVersion || '-'}</Text>
          </View>

          <Text style={[styles.section, { color: t.textMuted }]}>设置</Text>
          <TouchableOpacity
            style={[styles.subRow, { backgroundColor: t.card, borderColor: t.border }]}
            activeOpacity={0.7}
            onPress={onPlaybackSettings}
          >
            <Icon name="settings" size={20} color={t.text} />
            <Text style={[styles.subLabel, { color: t.text }]}>播放设置</Text>
            <Text style={[styles.subValue, { color: t.textMuted }]}>快进快退 · 速度</Text>
            <Icon name="chevronRight" size={16} color={t.textMuted} />
          </TouchableOpacity>

          <Text style={[styles.section, { color: t.textMuted }]}>缓存</Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: t.primary }]}
            onPress={async () => { await clearAudiobookshelfCache() }}
          >
            <Text style={styles.btnText}>清除本地缓存</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 18, fontWeight: '700' },
  section: { fontSize: 12, fontWeight: '600', marginTop: 16, marginBottom: 6, textTransform: 'uppercase' },
  url: { fontSize: 14, padding: 12, borderRadius: 8, backgroundColor: '#00000008' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 4 },
  metaLabel: { fontSize: 13 },
  metaValue: { fontSize: 13, fontWeight: '600' },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  subLabel: { fontSize: 15, fontWeight: '600', flex: 1 },
  subValue: { fontSize: 13 },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
})
