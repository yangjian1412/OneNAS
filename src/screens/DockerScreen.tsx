import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, StyleSheet } from 'react-native'
import { useAppStore } from '@/stores/appStore'
import { ServerConfig, DashboardData, Container, VM } from '@/types'
import { fetchDashboard, startContainer, stopContainer, restartContainer } from '@/lib/api/unraid'
import ContainerCard from '@/components/ContainerCard'
import { useTheme } from '@/lib/theme'

function bytesToGB(b: number): string { return (b / 1073741824).toFixed(1) }
function kBToTB(kb: number): string { return (kb / 1073741824).toFixed(1) }

function formatUptime(s: string): string {
  if (!s) return ''
  try {
    const ms = Date.now() - new Date(s).getTime()
    const d = Math.floor(ms / 86400000)
    const h = Math.floor((ms % 86400000) / 3600000)
    if (d > 0) return `${d}天 ${h}小时`
    return `${h}小时`
  } catch { return s }
}

const vmCardStyle = StyleSheet.create({
  card: { borderRadius: 10, padding: 14, marginBottom: 8 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  name: { fontSize: 15, fontWeight: '600' },
  badge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  hint: { fontSize: 12, marginTop: 6, marginLeft: 18 },
})

export default function DockerScreen() {
  const servers = useAppStore((s) => s.servers)
  const unraidServers = servers.filter((s) => s.type === 'unraid')
  const t = useTheme()

  const [selectedServer, setSelectedServer] = useState<ServerConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DashboardData | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const load = useCallback(async (server: ServerConfig, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    setError(null)
    const result = await fetchDashboard(server)
    if (result.ok) { setData(result.data!); setSelectedServer(server) }
    else { setError(result.error ?? '加载失败') }
    if (isRefresh) setRefreshing(false); else setLoading(false)
  }, [])

  useEffect(() => {
    if (unraidServers.length === 1 && !selectedServer) load(unraidServers[0])
  }, [unraidServers, selectedServer, load])

  const handleContainerAction = async (id: string, action: 'start' | 'stop' | 'restart') => {
    if (!selectedServer) return
    setActionLoading(id)
    let result
    if (action === 'start') result = await startContainer(selectedServer, id)
    else if (action === 'stop') result = await stopContainer(selectedServer, id)
    else result = await restartContainer(selectedServer, id)
    if (result.ok) { load(selectedServer) }
    else { Alert.alert('操作失败', result.error ?? '未知错误') }
    setActionLoading(null)
  }

  if (unraidServers.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Text style={[styles.emptyTitle, { color: t.text }]}>未配置 Unraid 服务器</Text>
        <Text style={[styles.emptySub, { color: t.textMuted }]}>请到设置 → 服务器 添加 Unraid</Text>
      </View>
    )
  }

  if (!selectedServer && unraidServers.length > 1) {
    return (
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        <Text style={[styles.title, { color: t.text, padding: 14 }]}>NAS 系统管理</Text>
        <View style={styles.center}>
          {unraidServers.map((s) => (
            <TouchableOpacity key={s.id} style={[styles.serverBtn, { borderColor: t.primary }]} onPress={() => load(s)}>
              <Text style={[styles.serverBtnText, { color: t.primary }]}>{s.name || s.host}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    )
  }

  if (loading && !data) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator size="large" color={t.primary} />
        <Text style={[styles.loadingText, { color: t.textMuted }]}>正在加载...</Text>
      </View>
    )
  }

  const d = data

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={[styles.header, { backgroundColor: t.headerBg, borderBottomColor: t.border }]}>
        <Text style={[styles.title, { color: t.text }]}>NAS 系统管理</Text>
        <TouchableOpacity onPress={() => selectedServer && load(selectedServer, true)} disabled={loading || refreshing}>
          <Text style={[styles.refresh, { color: t.primary }]}>刷新</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => selectedServer && load(selectedServer, true)} colors={[t.primary]} />}
        contentContainerStyle={styles.scroll}
      >
        {error && (
          <View style={styles.errRow}>
            <Text style={[styles.errText, { color: t.danger }]}>{error}</Text>
            <TouchableOpacity onPress={() => selectedServer && load(selectedServer)}><Text style={[styles.retry, { color: t.primary }]}>重试</Text></TouchableOpacity>
          </View>
        )}

        {d && (
          <>
            <View style={styles.cardsRow}>
              <View style={[styles.statusCard, { backgroundColor: t.card, borderColor: d.online ? t.success : t.danger }]}>
                <Text style={[styles.cardValue, { color: d.online ? t.success : t.danger }]}>{d.online ? '在线' : '离线'}</Text>
                <Text style={[styles.cardLabel, { color: t.textMuted }]}>{d.hostname || 'Unraid'}</Text>
              </View>
              <View style={[styles.statusCard, { backgroundColor: t.card, borderColor: t.border }]}>
                <Text style={[styles.cardValue, { color: t.text }]}>{d.cpuPercent.toFixed(1)}%</Text>
                <Text style={[styles.cardLabel, { color: t.textMuted }]}>CPU {d.cpuCores}核/{d.cpuThreads}线程</Text>
              </View>
              <View style={[styles.statusCard, { backgroundColor: t.card, borderColor: t.border }]}>
                <Text style={[styles.cardValue, { color: t.text }]}>{d.memoryPercent.toFixed(0)}%</Text>
                <Text style={[styles.cardLabel, { color: t.textMuted }]}>{bytesToGB(d.memoryUsed)}/{bytesToGB(d.memoryTotal)} GB</Text>
              </View>
            </View>

            {d.uptime ? <Text style={[styles.uptime, { color: t.textMuted }]}>运行时间: {formatUptime(d.uptime)}</Text> : null}

            {d.array && (
              <View style={[styles.sectionCard, { backgroundColor: t.card, borderColor: t.border }]}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: t.text }]}>阵列</Text>
                  <View style={[styles.stateBadge, { backgroundColor: d.array.state === 'STARTED' ? t.success + '22' : t.warning + '22' }]}>
                    <Text style={[styles.stateText, { color: d.array.state === 'STARTED' ? t.success : t.warning }]}>
                      {d.array.state === 'STARTED' ? '已启动' : d.array.state === 'STOPPED' ? '已停止' : d.array.state}
                    </Text>
                  </View>
                </View>
                {d.array.capacity?.kilobytes?.total > 0 && (
                  <View style={styles.capacityRow}>
                    <View style={[styles.capacityBarBg, { backgroundColor: t.border }]}>
                      <View style={[styles.capacityBarFill, {
                        backgroundColor: t.primary,
                        width: `${Math.min((d.array.capacity.kilobytes.used / d.array.capacity.kilobytes.total) * 100, 100)}%`,
                      }]} />
                    </View>
                    <Text style={[styles.capacityText, { color: t.textMuted }]}>
                      {kBToTB(d.array.capacity.kilobytes.used)}/{kBToTB(d.array.capacity.kilobytes.total)} TB
                    </Text>
                  </View>
                )}
                <Text style={[styles.diskCount, { color: t.textMuted }]}>{d.array.disks.length} 个磁盘</Text>
                {d.array.disks.map((disk, idx) => (
                  <View key={disk.name || idx} style={[styles.diskRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}>
                    <View style={styles.diskInfo}>
                      <Text style={[styles.diskName, { color: t.text }]}>{disk.name || disk.device}</Text>
                      <Text style={[styles.diskMeta, { color: t.textMuted }]}>
                        {disk.device} · {kBToTB(disk.size)}TB
                        {disk.temp > 0 ? ` · ${disk.temp}°C` : ''}
                      </Text>
                    </View>
                    <View style={[styles.diskStatus, { backgroundColor: disk.status === 'DISK_OK' ? t.success + '22' : t.warning + '22' }]}>
                      <Text style={[styles.diskStatusText, { color: disk.status === 'DISK_OK' ? t.success : t.warning }]}>
                        {disk.status === 'DISK_OK' ? '正常' : disk.status === 'DISK_NP' ? '离线' : disk.status}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {d.containers.length > 0 && (
              <View style={[styles.sectionCard, { backgroundColor: t.card, borderColor: t.border }]}>
                <Text style={[styles.sectionTitle, { color: t.text }]}>Docker ({d.containers.length})</Text>
                {d.containers.map((c) => (
                  <ContainerCard
                    key={c.id}
                    container={c}
                    onStart={(id) => handleContainerAction(id, 'start')}
                    onStop={(id) => handleContainerAction(id, 'stop')}
                    onRestart={(id) => handleContainerAction(id, 'restart')}
                    loading={actionLoading === c.id}
                  />
                ))}
              </View>
            )}

            {d.vms.length > 0 && (
              <View style={[styles.sectionCard, { backgroundColor: t.card, borderColor: t.border }]}>
                <Text style={[styles.sectionTitle, { color: t.text }]}>虚拟机 ({d.vms.length})</Text>
                {d.vms.map((vm) => (
                  <View key={vm.id} style={[vmCardStyle.card, { backgroundColor: t.card, borderWidth: 1, borderColor: t.border }]}>
                    <View style={vmCardStyle.top}>
                      <View style={vmCardStyle.nameRow}>
                        <View style={[vmCardStyle.dot, { backgroundColor: vm.state === 'running' ? t.success : t.textMuted }]} />
                        <Text style={[vmCardStyle.name, { color: t.text }]}>{vm.name}</Text>
                      </View>
                      <View style={[vmCardStyle.badge, { backgroundColor: (vm.state === 'running' ? t.success : t.textMuted) + '22' }]}>
                        <Text style={[vmCardStyle.badgeText, { color: vm.state === 'running' ? t.success : t.textMuted }]}>{vm.state === 'running' ? '运行中' : '已停止'}</Text>
                      </View>
                    </View>
                    <Text style={[vmCardStyle.hint, { color: t.textMuted }]}>
                      {vm.vcpus ? `${vm.vcpus} vCPU` : ''}{vm.vcpus && vm.memory ? ' · ' : ''}{vm.memory ? `${(vm.memory / 1073741824).toFixed(1)} GB` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {!d.array && d.containers.length === 0 && d.vms.length === 0 && (
              <View style={styles.center}>
                <Text style={[styles.emptySub, { color: t.textMuted }]}>暂无数据</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 4 },
  loadingText: { fontSize: 14, marginTop: 8 },
  scroll: { paddingBottom: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 18, fontWeight: '700' },
  refresh: { fontSize: 14, fontWeight: '600' },
  errRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 12, gap: 8 },
  errText: { fontSize: 13 },
  retry: { fontSize: 13, fontWeight: '600' },
  cardsRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 12, gap: 8 },
  statusCard: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  cardValue: { fontSize: 20, fontWeight: '800' },
  cardLabel: { fontSize: 10, marginTop: 4, textAlign: 'center' },
  uptime: { fontSize: 12, textAlign: 'center', paddingVertical: 8 },
  sectionCard: { marginHorizontal: 12, marginTop: 12, borderRadius: 12, padding: 14, borderWidth: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  stateBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  stateText: { fontSize: 12, fontWeight: '600' },
  capacityRow: { marginBottom: 8 },
  capacityBarBg: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  capacityBarFill: { height: '100%', borderRadius: 4 },
  capacityText: { fontSize: 12, textAlign: 'right' },
  diskCount: { fontSize: 12, marginBottom: 8 },
  diskRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  diskInfo: { flex: 1, marginRight: 8 },
  diskName: { fontSize: 14, fontWeight: '600' },
  diskMeta: { fontSize: 11, marginTop: 2 },
  diskStatus: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  diskStatusText: { fontSize: 11, fontWeight: '600' },
  serverBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12 },
  serverBtnText: { fontSize: 14, fontWeight: '600' },
})
