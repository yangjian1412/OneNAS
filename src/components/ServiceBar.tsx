import { useState } from 'react'
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native'
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
  const [showMore, setShowMore] = useState(false)
  const t = useTheme()
  const hasMore = topServices.length > 5
  const visibleServices = topServices.slice(0, hasMore ? 4 : 5)
  const extraServices = topServices.slice(hasMore ? 4 : 5)

  const pressService = (service: ServiceConfig) => {
    setShowMore(false)
    onServicePress(service)
  }

  return (
    <View style={[styles.wrapper, { backgroundColor: t.barBg, borderBottomColor: t.border, paddingTop: 2 }]}>
      <View style={styles.row}>
        {topServices.length === 0 ? (
          <Text style={[styles.emptyHint, { color: t.textMuted }]}>到设置添加服务以显示在这里</Text>
        ) : (
          visibleServices.map((svc) => (
            <TouchableOpacity key={svc.id} style={styles.item} onPress={() => pressService(svc)}>
              <View style={[styles.iconWrap, { backgroundColor: t.card }]}>
                <Icon name={SERVICE_TYPE_ICONS[svc.type] ?? 'folderEmpty'} size={32} />
              </View>
              <Text style={[styles.label, { color: t.textSecondary }]} numberOfLines={1}>{svc.name}</Text>
            </TouchableOpacity>
          ))
        )}
        {extraServices.length > 0 && (
          <TouchableOpacity style={styles.item} onPress={() => setShowMore(true)}>
            <View style={styles.moreDotsRow}>
              <View style={[styles.moreDot, { backgroundColor: t.textSecondary }]} />
              <View style={[styles.moreDot, { backgroundColor: t.textSecondary }]} />
              <View style={[styles.moreDot, { backgroundColor: t.textSecondary }]} />
            </View>
            <Text style={[styles.label, { color: t.textSecondary }]}>更多</Text>
          </TouchableOpacity>
        )}
      </View>
      <Modal visible={showMore} transparent animationType="fade" onRequestClose={() => setShowMore(false)}>
        <View style={styles.overlay}>
          <View style={[styles.moreSheet, { backgroundColor: t.card }]}>
            <Text style={[styles.moreTitle, { color: t.text }]}>更多服务</Text>
            {extraServices.map((svc) => (
              <TouchableOpacity key={svc.id} style={[styles.moreItem, { borderBottomColor: t.border }]} onPress={() => pressService(svc)}>
                <Icon name={SERVICE_TYPE_ICONS[svc.type] ?? 'folderEmpty'} size={22} />
                <Text style={[styles.moreLabel, { color: t.text }]}>{svc.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowMore(false)} style={styles.closeButton}><Text style={[styles.closeText, { color: t.primary }]}>关闭</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, elevation: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 10, minHeight: 92 },
  item: { alignItems: 'center', justifyContent: 'center', width: '20%' },
  iconWrap: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  moreDotsRow: { width: 56, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: 12 },
  moreDot: { width: 5, height: 5, borderRadius: 2.5 },
  label: { fontSize: 11, marginTop: 6, textAlign: 'center' },
  emptyHint: { fontSize: 12, paddingVertical: 10, paddingHorizontal: 8 },
  overlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: 24 },
  moreSheet: { borderRadius: 14, padding: 16, maxHeight: '70%' },
  moreTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  moreItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  moreLabel: { fontSize: 14, marginLeft: 12 },
  closeButton: { alignItems: 'center', paddingTop: 14 },
  closeText: { fontSize: 14, fontWeight: '600' },
})