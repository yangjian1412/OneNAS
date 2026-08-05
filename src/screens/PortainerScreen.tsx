import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, StyleSheet, Modal, Switch, Animated, BackHandler } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useAppStore } from '@/stores/appStore'
import { PortainerConfig, PortainerContainer, PortainerDashboardData } from '@/types'
import { fetchPortainerDashboard, portainerContainerAction, portainerInspectContainer, ContainerAction } from '@/lib/api/portainer'
import Icon from '@/components/Icon'
import { useTheme } from '@/lib/theme'

const STATE_COLORS: Record<string, string> = {
  running: '#4caf50',
  exited: '#f44336',
  paused: '#ff9800',
  restarting: '#2196f3',
  dead: '#9e9e9e',
  created: '#9e9e9e',
}

function stripName(names: string[]): string {
  return (names?.[0] ?? '').replace(/^\//, '') || 'unknown'
}

function portsToString(ports: PortainerContainer['Ports']): string {
  if (!ports || ports.length === 0) return ''
  return ports
    .filter((p) => p.PublicPort)
    .map((p) => `${p.PrivatePort}→${p.PublicPort}/${p.Type}`)
    .join(', ') || ports.map((p) => `${p.PrivatePort}/${p.Type}`).slice(0, 3).join(', ')
}

export default function PortainerScreen() {
  const portainerServer = useAppStore((s) => s.portainerServer)
  const t = useTheme()

  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<PortainerDashboardData | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [containerDetail, setContainerDetail] = useState<any | null>(null)
  const [containerDetailError, setContainerDetailError] = useState<string | null>(null)
  const [containerDetailLoading, setContainerDetailLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastBackPressRef = useRef(0)
  const toastAnim = useRef(new Animated.Value(0)).current
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevServerIdRef = useRef<string | null>(null)
  const isFocused = useIsFocused()
  const isFocusedRef = useRef(isFocused)
  isFocusedRef.current = isFocused

  const showToast = () => {
    Animated.timing(toastAnim, { toValue: 1, duration: 160, useNativeDriver: true }).start()
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start()
    }, 1500)
  }

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isFocusedRef.current) return false
      const now = Date.now()
      if (now - lastBackPressRef.current < 2000) {
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastAnim.setValue(0)
        return false
      }
      lastBackPressRef.current = now
      showToast()
      return true
    })
    return () => sub.remove()
  }, [])

  const ExitToast = (
    <Animated.View pointerEvents="none" style={[styles.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}>
      <View style={[styles.toastInner, { backgroundColor: '#000' }]}>
        <Text style={styles.toastText}>再按一次退出</Text>
      </View>
    </Animated.View>
  )

  const load = useCallback(async (server: PortainerConfig, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    setError(null)
    try {
      const result = await Promise.race([
        fetchPortainerDashboard(server),
        new Promise<{ ok: false; error: string }>((resolve) => setTimeout(() => resolve({ ok: false, error: '请求超时 (20s)' }), 20000)),
      ])
      if (result.ok && result.data) setData(result.data)
      else setError(result.error ?? '加载失败')
    } catch (e: any) {
      setError(e?.message ?? '加载异常')
    } finally {
      if (isRefresh) setRefreshing(false); else setLoading(false)
    }
  }, [])

  useEffect(() => {
    const newId = portainerServer?.id ?? null
    // server 切换时清空旧数据，避免显示错位
    if (prevServerIdRef.current !== null && prevServerIdRef.current !== newId) {
      setData(null)
      setError(null)
    }
    prevServerIdRef.current = newId
    if (portainerServer && !data) load(portainerServer)
  }, [portainerServer, data, load])

  useEffect(() => {
    if (!portainerServer || !autoRefresh) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    pollRef.current = setInterval(() => { load(portainerServer, true) }, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [portainerServer, autoRefresh, load])

  const handleContainerAction = async (id: string, action: ContainerAction) => {
    if (!portainerServer || !data) return
    setActionLoading(id)
    const result = await portainerContainerAction(portainerServer, data.endpointId, id, action)
    if (result.ok) {
      await new Promise((r) => setTimeout(r, 1000))
      await load(portainerServer, true)
    } else {
      Alert.alert('操作失败', result.error ?? '未知错误')
    }
    setActionLoading(null)
  }

  const handleContainerDetail = async (id: string) => {
    if (!portainerServer || !data) return
    setContainerDetailLoading(true)
    setContainerDetail(null)
    setContainerDetailError(null)
    try {
      const detail = await portainerInspectContainer(portainerServer, data.endpointId, id)
      setContainerDetail(detail)
    } catch (e: any) {
      setContainerDetailError(e?.message ?? '未知错误')
    }
    setContainerDetailLoading(false)
  }

  if (!portainerServer) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Icon name="docker" size={64} color={t.textMuted} />
        <Text style={[styles.emptyTitle, { color: t.text }]}>未配置 Portainer</Text>
        <Text style={[styles.emptySub, { color: t.textMuted }]}>请到设置 → 服务设置 → NAS 管理 切换为 Docker（Portainer）并配置服务器</Text>
        {ExitToast}
      </View>
    )
  }

  if (loading && !data) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator size="large" color={t.primary} />
        <Text style={[styles.loadingText, { color: t.textMuted }]}>正在加载...</Text>
        {ExitToast}
      </View>
    )
  }

  const containers = data?.containers ?? []

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={[styles.header, { backgroundColor: t.headerBg, borderBottomColor: t.border }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.statusDot, { backgroundColor: data ? t.success : t.danger }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{data?.endpointName ?? 'Docker (Portainer)'}</Text>
            <Text style={[styles.subtitle, { color: t.textMuted }]}>
              {data ? `${containers.length} 容器` : '离线'} · {portainerServer.url.replace(/\/+$/, '')}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.autoRefreshBox}>
            <Text style={[styles.autoRefreshLabel, { color: t.textMuted }]}>自动</Text>
            <Switch
              value={autoRefresh}
              onValueChange={setAutoRefresh}
              trackColor={{ false: t.border, true: t.primary + '88' }}
              thumbColor={autoRefresh ? t.primary : '#f4f3f4'}
              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
          </View>
          <TouchableOpacity onPress={() => portainerServer && load(portainerServer, true)} disabled={loading || refreshing} style={styles.headerBtn}>
            <Icon name="refresh" size={20} color={t.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => portainerServer && load(portainerServer, true)} colors={[t.primary]} tintColor={t.primary} />}
        contentContainerStyle={styles.scroll}
      >
        {error && (
          <View style={[styles.errCard, { backgroundColor: t.danger + '15', borderColor: t.danger }]}>
            <Text style={[styles.errText, { color: t.danger }]}>{error}</Text>
            <TouchableOpacity onPress={() => portainerServer && load(portainerServer)}><Text style={[styles.retry, { color: t.danger }]}>重试</Text></TouchableOpacity>
          </View>
        )}

        <View style={[styles.sectionCard, { backgroundColor: t.card, borderColor: t.border }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Icon name="boxes" size={18} color={t.primary} />
              <Text style={[styles.sectionTitle, { color: t.text }]}>Docker 容器</Text>
            </View>
            {containers.length > 0 && (
              <View style={[styles.stateBadge, { backgroundColor: t.primary + '22' }]}>
                <Text style={[styles.stateText, { color: t.primary }]}>{containers.length}</Text>
              </View>
            )}
          </View>
          {containers.length === 0 ? (
            <Text style={{ color: t.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>无容器</Text>
          ) : (
            containers.map((c) => {
              const stateLower = (c.State || '').toLowerCase()
              const color = STATE_COLORS[stateLower] ?? '#999'
              const name = stripName(c.Names)
              const ports = portsToString(c.Ports)
              const isRunning = stateLower === 'running'
              return (
                <View key={c.Id} style={[styles.card, { backgroundColor: t.bg, borderColor: t.border }]}>
                  <View style={styles.top}>
                    <View style={styles.nameRow}>
                      <View style={[styles.dot, { backgroundColor: color }]} />
                      <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>{name}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: color + '22' }]}>
                      <Text style={[styles.badgeText, { color }]}>{c.State || 'unknown'}</Text>
                    </View>
                  </View>
                  <Text style={[styles.image, { color: t.textSecondary }]} numberOfLines={1}>{c.Image}</Text>
                  {ports ? <Text style={[styles.ports, { color: t.textMuted }]} numberOfLines={1}>Ports: {ports}</Text> : null}
                  <View style={styles.actions}>
                    {isRunning ? (
                      <>
                        <TouchableOpacity style={[styles.btn, { borderColor: t.danger }]} onPress={() => handleContainerAction(c.Id, 'stop')} disabled={actionLoading === c.Id}>
                          <Text style={[styles.btnText, { color: t.danger }]}>Stop</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.btn, { borderColor: t.warning }]} onPress={() => handleContainerAction(c.Id, 'restart')} disabled={actionLoading === c.Id}>
                          <Text style={[styles.btnText, { color: t.warning }]}>Restart</Text>
                        </TouchableOpacity>
                      </>
                    ) : stateLower === 'paused' ? (
                      <TouchableOpacity style={[styles.btn, { borderColor: t.success }]} onPress={() => handleContainerAction(c.Id, 'unpause')} disabled={actionLoading === c.Id}>
                        <Text style={[styles.btnText, { color: t.success }]}>Resume</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.btn, { borderColor: t.success }]} onPress={() => handleContainerAction(c.Id, 'start')} disabled={actionLoading === c.Id}>
                        <Text style={[styles.btnText, { color: t.success }]}>Start</Text>
                      </TouchableOpacity>
                    )}
                    {isRunning ? (
                      <TouchableOpacity style={[styles.btn, { borderColor: t.textMuted }]} onPress={() => handleContainerAction(c.Id, 'pause')} disabled={actionLoading === c.Id}>
                        <Text style={[styles.btnText, { color: t.textMuted }]}>Pause</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity style={[styles.btn, { borderColor: t.textMuted }]} onPress={() => handleContainerDetail(c.Id)} disabled={actionLoading === c.Id}>
                      <Text style={[styles.btnText, { color: t.textMuted }]}>详情</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )
            })
          )}
        </View>
      </ScrollView>

      <ContainerDetailModal
        detail={containerDetail}
        error={containerDetailError}
        loading={containerDetailLoading}
        onClose={() => { setContainerDetail(null); setContainerDetailError(null) }}
      />
      {ExitToast}
    </View>
  )
}

function ContainerDetailModal({ detail, error, loading, onClose }: { detail: any | null; error: string | null; loading: boolean; onClose: () => void }) {
  const t = useTheme()
  return (
    <Modal visible={!!detail || loading || !!error} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.panel, { backgroundColor: t.card }]}>
          <View style={modalStyles.header}>
            <Text style={[modalStyles.title, { color: t.text }]} numberOfLines={1}>{stripName(detail?.Name ? [detail.Name] : detail?.Names) || '容器详情'}</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color: t.primary, fontSize: 15 }}>关闭</Text></TouchableOpacity>
          </View>
          {loading ? (
            <View style={modalStyles.loading}><ActivityIndicator color={t.primary} /></View>
          ) : error ? (
            <View style={modalStyles.loading}>
              <Text style={{ color: t.danger, fontSize: 13, textAlign: 'center', paddingHorizontal: 16 }}>{error}</Text>
            </View>
          ) : detail ? (
            <ScrollView style={modalStyles.body}>
              <DetailRow label="镜像" value={detail.Config?.Image ?? detail.Image} theme={t} />
              <DetailRow label="状态" value={detail.State?.Status ?? detail.State} theme={t} />
              <DetailRow label="运行" value={detail.Status} theme={t} mono />
              {detail.Config?.Cmd ? <DetailRow label="启动命令" value={(Array.isArray(detail.Config.Cmd) ? detail.Config.Cmd.join(' ') : String(detail.Config.Cmd))} theme={t} mono /> : null}
              {detail.Created ? <DetailRow label="创建时间" value={formatDate(detail.Created)} theme={t} /> : null}

              {Array.isArray(detail.Mounts) && detail.Mounts.length > 0 && (
                <View style={modalStyles.section}>
                  <Text style={[modalStyles.sectionTitle, { color: t.textMuted }]}>挂载点</Text>
                  {detail.Mounts.map((m: any, i: number) => (
                    <Text key={i} style={[modalStyles.monoText, { color: t.text }]} numberOfLines={1}>{[m.Source, m.Destination].filter(Boolean).join(' → ')}</Text>
                  ))}
                </View>
              )}

              {detail.NetworkSettings?.Networks && Object.keys(detail.NetworkSettings.Networks).length > 0 && (
                <View style={modalStyles.section}>
                  <Text style={[modalStyles.sectionTitle, { color: t.textMuted }]}>网络</Text>
                  {Object.entries(detail.NetworkSettings.Networks).map(([name, net]: [string, any]) => (
                    <Text key={name} style={[modalStyles.monoText, { color: t.text }]} numberOfLines={1}>
                      {name}{net.IPAddress ? ` · ${net.IPAddress}` : ''}
                    </Text>
                  ))}
                </View>
              )}

              {detail.Config?.Env && detail.Config.Env.length > 0 && (
                <View style={modalStyles.section}>
                  <Text style={[modalStyles.sectionTitle, { color: t.textMuted }]}>环境变量</Text>
                  {detail.Config.Env.slice(0, 50).map((env: string, i: number) => (
                    <Text key={i} style={[modalStyles.monoText, { color: t.text }]} numberOfLines={1}>{env}</Text>
                  ))}
                  {detail.Config.Env.length > 50 && <Text style={{ color: t.textMuted, fontSize: 11, marginTop: 4 }}>… 共 {detail.Config.Env.length} 项</Text>}
                </View>
              )}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

function DetailRow({ label, value, theme, mono }: { label: string; value: string | undefined; theme: any; mono?: boolean }) {
  return (
    <View style={[detailStyles.row, { borderBottomColor: theme.border }]}>
      <Text style={[detailStyles.label, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[detailStyles.value, { color: theme.text }, mono && { fontFamily: 'monospace', fontSize: 12 }]} numberOfLines={3}>{value || '–'}</Text>
    </View>
  )
}

function formatDate(unix: string): string {
  if (!unix) return ''
  try {
    const d = new Date(unix)
    return d.toLocaleString('zh-CN', { hour12: false })
  } catch { return '' }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 4, paddingHorizontal: 12 },
  loadingText: { fontSize: 14, marginTop: 8 },
  scroll: { paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  autoRefreshBox: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  autoRefreshLabel: { fontSize: 11 },
  headerBtn: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 11, marginTop: 1 },
  errCard: { marginHorizontal: 12, marginTop: 10, padding: 12, borderRadius: 10, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  errText: { fontSize: 13, flex: 1 },
  retry: { fontSize: 13, fontWeight: '600' },
  sectionCard: { marginHorizontal: 12, marginTop: 12, borderRadius: 12, padding: 14, borderWidth: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  stateBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  stateText: { fontSize: 12, fontWeight: '600' },
  card: { borderRadius: 8, padding: 12, marginVertical: 4, borderWidth: StyleSheet.hairlineWidth },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  name: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  badge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  image: { fontSize: 12, marginTop: 4, marginLeft: 18, fontFamily: 'monospace' },
  ports: { fontSize: 11, marginTop: 2, marginLeft: 18 },
  actions: { flexDirection: 'row', marginTop: 8, gap: 6, marginLeft: 18, flexWrap: 'wrap' },
  btn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  btnText: { fontSize: 11, fontWeight: '600' },
  toast: { position: 'absolute', left: 0, right: 0, bottom: 120, alignItems: 'center' },
  toastInner: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24 },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  panel: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 17, fontWeight: '700', flex: 1, marginRight: 12 },
  body: { padding: 16 },
  loading: { padding: 40, alignItems: 'center' },
  section: { marginBottom: 16, marginTop: 4 },
  sectionTitle: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  monoText: { fontFamily: 'monospace', fontSize: 12, marginTop: 2 },
})

const detailStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  label: { fontSize: 13, fontWeight: '500', minWidth: 70 },
  value: { fontSize: 13, flex: 1, textAlign: 'right' },
})