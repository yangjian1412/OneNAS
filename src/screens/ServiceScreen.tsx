import { View, Text, StyleSheet } from 'react-native'
import { useAppStore } from '@/stores/appStore'
import ServiceCard from '@/components/ServiceCard'
import JellyfinScreen from './JellyfinScreen'
import Icon from '@/components/Icon'
import { SERVICE_TYPE_ICONS } from '@/lib/constants'
import { useTheme } from '@/lib/theme'

interface Props {
  serviceId: string | null
}

export default function ServiceScreen({ serviceId }: Props) {
  const services = useAppStore((s) => s.services)
  const service = services.find((s) => s.id === serviceId)
  const t = useTheme()

  if (!service) {
    return (
      <View style={[styles.empty, { backgroundColor: t.bg }]}>
        <Icon name={SERVICE_TYPE_ICONS['jellyfin'] ?? 'folderEmpty'} size={64} />
        <Text style={[styles.emptyTitle, { color: t.text }]}>未配置服务</Text>
        <Text style={[styles.emptySub, { color: t.textMuted }]}>请到设置 → 标签设置 为当前标签分配一个服务</Text>
      </View>
    )
  }

  if (service.type === 'jellyfin') {
    return <JellyfinScreen service={service} />
  }

  return <ServiceCard service={service} />
}

const styles = StyleSheet.create({
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyIcon: { marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 4 },
})