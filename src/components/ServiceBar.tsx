import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { useAppStore, getTopBarServices } from '@/stores/appStore'
import { ServiceConfig } from '@/types'
import { SERVICE_TYPE_ICONS } from '@/lib/constants'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'

interface Props {
  onServicePress: (service: ServiceConfig) => void
}

export default function ServiceBar({ onServicePress }: Props) {
  const services = useAppStore((s) => s.services)
  const topServices = getTopBarServices(services)
  const t = useTheme()

  return (
    <View style={[styles.wrapper, { backgroundColor: t.barBg, borderBottomColor: t.border, paddingTop: 2 }]}>
      {topServices.length === 0 ? (
        <Text style={[styles.emptyHint, { color: t.textMuted }]}>到设置添加服务以显示在这里</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {topServices.map((svc) => (
            <TouchableOpacity key={svc.id} style={styles.item} onPress={() => onServicePress(svc)}>
              <View style={[styles.iconWrap, { backgroundColor: t.card }]}>
                <Icon name={SERVICE_TYPE_ICONS[svc.type] ?? 'folderEmpty'} size={32} />
              </View>
              <Text style={[styles.label, { color: t.textSecondary }]} numberOfLines={1}>{svc.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, elevation: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 10, minHeight: 92 },
  item: { alignItems: 'center', justifyContent: 'center', width: 76 },
  iconWrap: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 11, marginTop: 6, textAlign: 'center' },
  emptyHint: { fontSize: 12, paddingVertical: 10, paddingHorizontal: 8 },
})