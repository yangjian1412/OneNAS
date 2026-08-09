import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native'
import FullScreenModal from '@/components/FullScreenModal'
import Icon from '@/components/Icon'
import { useTheme } from '@/lib/theme'
import { JellyfinServerConfig } from '@/types'
import type { UpnpDevice } from '@/lib/upnp/types'
import { discoverRenderers } from '@/lib/upnp/discovery'

interface Props {
  visible: boolean
  server: JellyfinServerConfig
  onClose: () => void
  onPick: (target: UpnpDevice) => void
}

export default function CastDeviceListModal({ visible, server, onClose, onPick }: Props) {
  const t = useTheme()
  const [loading, setLoading] = useState(false)
  const [devices, setDevices] = useState<UpnpDevice[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await discoverRenderers(5000)
      setDevices(list)
    } catch (e: any) {
      setError(e?.message ?? 'UPnP 发现失败')
      setDevices([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (visible) { void load() }
  }, [visible, load])

  return (
    <FullScreenModal visible={visible} onClose={onClose} title="选择投屏设备" t={t}>
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        {error ? (
          <View style={styles.center}>
            <Icon name="alertCircle" size={40} color={t.danger} />
            <Text style={[styles.errorText, { color: t.danger }]}>{error}</Text>
            <TouchableOpacity style={[styles.retryBtn, { borderColor: t.primary }]} onPress={load}>
              <Text style={[styles.retryText, { color: t.primary }]}>重试</Text>
            </TouchableOpacity>
          </View>
        ) : loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={t.primary} />
          </View>
        ) : devices.length === 0 ? (
          <View style={styles.center}>
            <Icon name="connectedTv" size={48} color={t.textMuted} />
            <Text style={[styles.emptyTitle, { color: t.text }]}>未发现可投屏设备</Text>
            <TouchableOpacity style={[styles.retryBtn, { borderColor: t.primary }]} onPress={load}>
              <Text style={[styles.retryText, { color: t.primary }]}>刷新</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            {devices.map((d) => (
              <TouchableOpacity
                key={d.udn || d.location}
                style={[styles.deviceRow, { backgroundColor: t.card, borderColor: t.border }]}
                onPress={() => onPick(d)}
              >
                <View style={[styles.iconWrap, { backgroundColor: t.bg }]}>
                  <Icon name="connectedTv" size={28} color={t.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.deviceName, { color: t.text }]} numberOfLines={1}>{d.friendlyName || d.location}</Text>
                  <Text style={[styles.deviceMeta, { color: t.textMuted }]} numberOfLines={1}>
                    {(d.manufacturer || 'DLNA') + (d.modelName ? ` · ${d.modelName}` : '')}
                  </Text>
                </View>
                <Icon name="chevronRight" size={20} color={t.textMuted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.refreshBtn} onPress={load}>
              <Text style={{ color: t.textMuted }}>刷新</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </FullScreenModal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  errorText: { fontSize: 13, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  retryText: { fontSize: 14, fontWeight: '500' },
  list: { padding: 12 },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    gap: 12,
  },
  iconWrap: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  deviceName: { fontSize: 15, fontWeight: '600' },
  deviceMeta: { fontSize: 12, marginTop: 2 },
  refreshBtn: { alignSelf: 'center', padding: 12 },
})