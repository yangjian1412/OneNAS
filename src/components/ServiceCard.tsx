import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { ServiceConfig } from '@/types'
import { SERVICE_TYPE_LABELS, SERVICE_TYPE_ICONS } from '@/lib/constants'
import { launchAppWithFallback } from '@/lib/android-intent'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'

interface Props {
  service: ServiceConfig
}

export default function ServiceCard({ service }: Props) {
  const t = useTheme()
  const hasUrl = !!service.url

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={styles.iconRow}>
        <Icon name={SERVICE_TYPE_ICONS[service.type] ?? 'folderEmpty'} size={96} />
      </View>
      <Text style={[styles.name, { color: t.text }]}>{service.name}</Text>
      <Text style={[styles.type, { color: t.textMuted }]}>{SERVICE_TYPE_LABELS[service.type] ?? service.type}</Text>

      {hasUrl ? (
        <>
          <Text style={[styles.url, { color: t.textMuted }]} numberOfLines={1}>{service.url}</Text>
          <TouchableOpacity style={[styles.launchBtn, { backgroundColor: t.primary }]} onPress={() => launchAppWithFallback(service.type, service.name, service.url)}>
            <Text style={styles.launchBtnText}>打开</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={[styles.pendingHint, { color: t.textMuted }]}>请先在设置中配置该服务</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  iconRow: { marginBottom: 16 },
  name: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  type: { fontSize: 14, marginBottom: 8 },
  url: { fontSize: 13, marginBottom: 24, maxWidth: '80%' },
  pendingHint: { fontSize: 15, marginBottom: 24, textAlign: 'center' },
  launchBtn: { borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14 },
  launchBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})