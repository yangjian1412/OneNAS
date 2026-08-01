import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native'
import { useTheme } from '@/lib/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { clearNavidromeCache } from '@/lib/api/navidromeCache'

interface Props {
  visible: boolean
  onClose: () => void
  serverUrl?: string
}

export default function NavidromeServerSettings({ visible, onClose, serverUrl }: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  if (!visible) return null
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: t.bg, paddingTop: 40, paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { backgroundColor: t.headerBg, borderBottomColor: t.border }]}>
          <Text style={[styles.title, { color: t.text }]}>服务器设置</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ color: t.primary, fontSize: 16 }}>关闭</Text></TouchableOpacity>
        </View>
        <View style={{ padding: 16 }}>
          <Text style={[styles.section, { color: t.textMuted }]}>服务器</Text>
          <Text style={[styles.url, { color: t.text }]} numberOfLines={2}>{serverUrl || '未连接'}</Text>

          <Text style={[styles.section, { color: t.textMuted }]}>缓存</Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: t.primary }]}
            onPress={async () => { await clearNavidromeCache() }}
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
  url: { fontSize: 14, padding: 12, borderRadius: 8 },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
})