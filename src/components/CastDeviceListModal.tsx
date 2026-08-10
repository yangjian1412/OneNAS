import { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, TextInput, Alert, KeyboardAvoidingView, Platform, NativeEventEmitter, NativeModules } from 'react-native'
import FullScreenModal from '@/components/FullScreenModal'
import Icon from '@/components/Icon'
import { useTheme } from '@/lib/theme'
import type { UpnpDevice } from '@/lib/upnp/types'
import { discoverRenderers, discoverRendererByIp } from '@/lib/upnp/discovery'

interface Props {
  visible: boolean
  onClose: () => void
  onPick: (target: UpnpDevice) => void
}

const DISCOVERY_TIMEOUT_MS = 5000

export default function CastDeviceListModal({ visible, onClose, onPick }: Props) {
  const t = useTheme()
  const [loading, setLoading] = useState(false)
  const [devices, setDevices] = useState<UpnpDevice[]>([])
  const [error, setError] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualHost, setManualHost] = useState('')
  const [manualBusy, setManualBusy] = useState(false)
  const [countdown, setCountdown] = useState(Math.ceil(DISCOVERY_TIMEOUT_MS / 1000))
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCountdown = useCallback(() => {
    setCountdown(Math.ceil(DISCOVERY_TIMEOUT_MS / 1000))
    if (tickerRef.current) clearInterval(tickerRef.current)
    const start = Date.now()
    tickerRef.current = setInterval(() => {
      const left = Math.max(0, DISCOVERY_TIMEOUT_MS - (Date.now() - start))
      setCountdown(Math.ceil(left / 1000))
    }, 250)
  }, [])

  const stopCountdown = useCallback(() => {
    if (tickerRef.current) {
      clearInterval(tickerRef.current)
      tickerRef.current = null
    }
  }, [])

  const addOrReplaceDevice = useCallback((d: UpnpDevice) => {
    setDevices((prev) => {
      const key = d.udn || d.location
      const idx = prev.findIndex((x) => (x.udn || x.location) === key)
      if (idx >= 0) {
        const next = prev.slice()
        next[idx] = d
        return next
      }
      return [...prev, d]
    })
  }, [])

  // 订阅原生流式事件：边发现边显示
  // bridgeless 下必须用 NativeEventEmitter(模块实例)，裸 DeviceEventEmitter 收不到原生事件
  useEffect(() => {
    const upnp = NativeModules.UpnpModule as { addListener?: (t: string) => void } | undefined
    const emitter = upnp ? new NativeEventEmitter(upnp) : null
    const sub1 = emitter?.addListener('upnpRenderer', (d: UpnpDevice) => {
      addOrReplaceDevice(d)
    })
    const sub2 = emitter?.addListener('upnpDone', () => {
      setLoading(false)
      stopCountdown()
    })
    return () => {
      sub1?.remove()
      sub2?.remove()
    }
  }, [addOrReplaceDevice, stopCountdown])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setDevices([])
    startCountdown()
    try {
      // discoverRenderers 同时也会 promise.resolve 最终结果，但 upnpRenderer 事件已经把设备推过来。
      // 这里拿到的 list 是兜底（如果事件没收到）。
      const list = await discoverRenderers(DISCOVERY_TIMEOUT_MS)
      // 兜底合并：可能事件流漏掉的设备
      setDevices((prev) => {
        const map = new Map<string, UpnpDevice>()
        for (const d of prev) map.set(d.udn || d.location, d)
        for (const d of list) map.set(d.udn || d.location, d)
        return Array.from(map.values())
      })
    } catch (e: any) {
      setError(e?.message ?? 'UPnP 发现失败')
    } finally {
      setLoading(false)
      stopCountdown()
    }
  }, [startCountdown, stopCountdown])

  useEffect(() => {
    if (visible) {
      void load()
    } else {
      setManualOpen(false)
      setManualHost('')
      setDevices([])
    }
    return () => stopCountdown()
  }, [visible, load, stopCountdown])

  const handleManualAdd = useCallback(async () => {
    const host = manualHost.trim()
    if (!host) {
      Alert.alert('提示', '请输入电视 IP 地址')
      return
    }
    setManualBusy(true)
    try {
      const dev = await discoverRendererByIp(host, 80)
      onPick(dev)
    } catch (e: any) {
      Alert.alert('手动添加失败', e?.message ?? '未知错误')
    } finally {
      setManualBusy(false)
    }
  }, [manualHost, onPick])

  return (
    <FullScreenModal visible={visible} onClose={onClose} title="选择投屏设备" t={t}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.container, { backgroundColor: t.bg }]}>
          {devices.length > 0 ? (
            // 已有设备：列表立即显示，顶部可选"搜索中…"提示
            <View style={styles.list}>
              {loading && (
                <View style={[styles.searchingPill, { backgroundColor: t.card, borderColor: t.border }]}>
                  <ActivityIndicator size="small" color={t.primary} />
                  <Text style={[styles.searchingText, { color: t.textMuted }]}>搜索中… {countdown}s</Text>
                </View>
              )}
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
              <View style={styles.footerRow}>
                <TouchableOpacity onPress={load}>
                  <Text style={{ color: t.textMuted }}>刷新</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setManualOpen(true)}>
                  <Text style={{ color: t.textMuted }}>手动添加</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : loading ? (
            // 没有设备且仍在搜索：满屏 spinner + 倒计时
            <View style={styles.center}>
              <ActivityIndicator color={t.primary} />
              <Text style={[styles.loadingText, { color: t.textMuted }]}>正在搜索电视… {countdown}s</Text>
            </View>
          ) : error ? (
            // 搜索结束、有错误
            <View style={styles.center}>
              <Icon name="alertCircle" size={40} color={t.danger} />
              <Text style={[styles.errorTitle, { color: t.text }]}>未发现可投屏设备</Text>
              <Text style={[styles.errorText, { color: t.textMuted }]}>{error}</Text>
              <View style={styles.btnRow}>
                <TouchableOpacity style={[styles.retryBtn, { borderColor: t.primary }]} onPress={load}>
                  <Text style={[styles.retryText, { color: t.primary }]}>重新搜索</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.retryBtn, { borderColor: t.primary, marginLeft: 12 }]} onPress={() => setManualOpen(true)}>
                  <Text style={[styles.retryText, { color: t.primary }]}>手动添加</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            // 搜索结束、无设备、无错误
            <View style={styles.center}>
              <Icon name="connectedTv" size={48} color={t.textMuted} />
              <Text style={[styles.emptyTitle, { color: t.text }]}>未发现可投屏设备</Text>
              <View style={styles.btnRow}>
                <TouchableOpacity style={[styles.retryBtn, { borderColor: t.primary }]} onPress={load}>
                  <Text style={[styles.retryText, { color: t.primary }]}>刷新</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.retryBtn, { borderColor: t.primary, marginLeft: 12 }]} onPress={() => setManualOpen(true)}>
                  <Text style={[styles.retryText, { color: t.primary }]}>手动添加</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {manualOpen && (
            <View style={[styles.manualPanel, { backgroundColor: t.card, borderColor: t.border }]}>
              <Text style={[styles.manualTitle, { color: t.text }]}>手动添加电视</Text>
              <Text style={[styles.manualHint, { color: t.textMuted }]}>
                自动发现找不到时可输入电视 IP（同一 LAN），常见路径已自动尝试。
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                value={manualHost}
                onChangeText={setManualHost}
                placeholder="192.168.1.100"
                placeholderTextColor={t.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!manualBusy}
              />
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[styles.retryBtn, { borderColor: t.border }]}
                  onPress={() => { setManualOpen(false); setManualHost('') }}
                  disabled={manualBusy}
                >
                  <Text style={[styles.retryText, { color: t.text }]}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.retryBtn, { borderColor: t.primary, marginLeft: 12 }]}
                  onPress={handleManualAdd}
                  disabled={manualBusy}
                >
                  <Text style={[styles.retryText, { color: t.primary }]}>
                    {manualBusy ? '连接中…' : '添加并投屏'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </FullScreenModal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  loadingText: { fontSize: 13, marginTop: 8 },
  searchingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    gap: 8,
  },
  searchingText: { fontSize: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  errorTitle: { fontSize: 16, fontWeight: '600' },
  errorText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  btnRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  retryBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth },
  retryText: { fontSize: 14, fontWeight: '500' },
  list: { padding: 12, flex: 1 },
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
  footerRow: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 8 },
  manualPanel: {
    position: 'absolute',
    left: 16, right: 16, bottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  manualTitle: { fontSize: 15, fontWeight: '600' },
  manualHint: { fontSize: 12, lineHeight: 16 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
})
