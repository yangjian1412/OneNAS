import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, StyleSheet, Modal, Switch, Animated, BackHandler } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useAppStore } from '@/stores/appStore'
import { ServerConfig, DashboardData } from '@/types'
import { fetchDashboard, startContainer, stopContainer, restartContainer, startVM, stopVM, restartVM, pauseVM, resumeVM, fetchContainerDetail } from '@/lib/api/unraid'
import { getDockerCapabilities } from '@/lib/api/unraidCapabilities'
import ContainerCard from '@/components/ContainerCard'
import CircularProgress from '@/components/CircularProgress'
import Icon from '@/components/Icon'
import { useTheme } from '@/lib/theme'

function bytesToGB(b: number): string { return (b / 1073741824).toFixed(1) }
function kBToTB(kb: number): string { return (kb / 1073741824).toFixed(2) }
function kBToGB(kb: number): string { return (kb / 1048576).toFixed(1) }

function formatSizeUnit(kb: number): string {
  const tb = kb / 1073741824
  if (tb >= 1) return `${tb.toFixed(1)} TB`
  const gb = kb / 1048576
  if (gb >= 1) return `${gb.toFixed(0)} GB`
  return `${Math.max(1, Math.round(gb * 1024))} MB`
}

function formatUptime(s: string): string {
  if (!s) return ''
  try {
    const ms = Date.now() - new Date(s).getTime()
    const d = Math.floor(ms / 86400000)
    const h = Math.floor((ms % 86400000) / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    if (d > 0) return `${d}天 ${h}小时`
    if (h > 0) return `${h}小时 ${m}分钟`
    return `${m}分钟`
  } catch { return s }
}

function tempColor(temp: number, t: any): string {
  if (temp === 0 || isNaN(temp)) return t.textMuted
  if (temp < 40) return t.success
  if (temp < 50) return t.warning
  return t.danger
}

function diskTypeLabel(type: string | undefined): string {
  if (type === 'PARITY') return '校验盘'
  if (type === 'CACHE') return '缓存盘'
  return '阵列盘'
}

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
  const [containerDetail, setContainerDetail] = useState<any>(null)
  const [containerDetailError, setContainerDetailError] = useState<string | null>(null)
  const [containerDetailLoading, setContainerDetailLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastBackPressRef = useRef(0)
  const toastAnim = useRef(new Animated.Value(0)).current
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  const load = useCallback(async (server: ServerConfig, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    setError(null)
    try {
      const result = await Promise.race([
        fetchDashboard(server),
        new Promise<{ ok: false; error: string }>((resolve) => setTimeout(() => resolve({ ok: false, error: '请求超时 (20s)' }), 20000)),
      ])
      if (result.ok) { setData(result.data!); setSelectedServer(server) }
      else { setError(result.error ?? '加载失败') }
    } catch (e: any) {
      setError(e?.message ?? '加载异常')
    } finally {
      if (isRefresh) setRefreshing(false); else setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (unraidServers.length === 1 && !selectedServer) load(unraidServers[0])
  }, [unraidServers, selectedServer, load])

  useEffect(() => {
    unraidServers.forEach((s) => { void getDockerCapabilities(s) })
  }, [unraidServers])

  useEffect(() => {
    if (!selectedServer || !autoRefresh) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    pollRef.current = setInterval(() => { load(selectedServer, true) }, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [selectedServer, autoRefresh, load])

  const handleContainerAction = async (id: string, action: 'start' | 'stop' | 'restart') => {
    if (!selectedServer) return
    setActionLoading(id)
    let result
    if (action === 'start') result = await startContainer(selectedServer, id)
    else if (action === 'stop') result = await stopContainer(selectedServer, id)
    else result = await restartContainer(selectedServer, id)
    if (result.ok) {
      // Unraid GraphQL 状态切换需要 1 秒才能稳定，再 reload 避免「操作失败 400」误报
      await new Promise((r) => setTimeout(r, 1000))
      await load(selectedServer, true)
    }
    else { Alert.alert('操作失败', result.error ?? '未知错误') }
    setActionLoading(null)
  }

  const handleVMAction = async (id: string, action: 'start' | 'stop' | 'restart' | 'pause' | 'resume') => {
    if (!selectedServer) return
    setActionLoading(id)
    let result
    if (action === 'start') result = await startVM(selectedServer, id)
    else if (action === 'stop') result = await stopVM(selectedServer, id)
    else if (action === 'restart') result = await restartVM(selectedServer, id)
    else if (action === 'pause') result = await pauseVM(selectedServer, id)
    else result = await resumeVM(selectedServer, id)
    if (result.ok) {
      await new Promise((r) => setTimeout(r, 1000))
      await load(selectedServer, true)
    }
    else { Alert.alert('操作失败', result.error ?? '未知错误') }
    setActionLoading(null)
  }

  const handleContainerDetail = async (id: string) => {
    if (!selectedServer) return
    setContainerDetailLoading(true)
    setContainerDetail(null)
    setContainerDetailError(null)
    const res = await fetchContainerDetail(selectedServer, id)
    if (res.ok) {
      const container = (res.data as any)?.docker?.container
      if (container) setContainerDetail(container)
      else setContainerDetailError('未返回容器数据')
    } else {
      setContainerDetailError(res.error ?? '未知错误')
    }
    setContainerDetailLoading(false)
  }

  if (unraidServers.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Icon name="server" size={64} color={t.textMuted} />
        <Text style={[styles.emptyTitle, { color: t.text }]}>未配置 Unraid 服务器</Text>
        <Text style={[styles.emptySub, { color: t.textMuted }]}>请到设置 → 服务器 添加 Unraid</Text>
        {ExitToast}
      </View>
    )
  }

  if (!selectedServer && unraidServers.length > 1) {
    return (
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        <Text style={[styles.pageTitle, { color: t.text, padding: 14 }]}>NAS 系统管理</Text>
        <View style={styles.center}>
          {unraidServers.map((s) => (
            <TouchableOpacity key={s.id} style={[styles.serverBtn, { borderColor: t.primary, backgroundColor: t.card }]} onPress={() => load(s)}>
              <Icon name="server" size={20} color={t.primary} />
              <Text style={[styles.serverBtnText, { color: t.primary }]}>{s.name || s.host}</Text>
            </TouchableOpacity>
          ))}
        </View>
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

  const d = data
  // 在线状态：能拉到 uptime 即视为在线
  const online = !!d?.uptime

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={[styles.header, { backgroundColor: t.headerBg, borderBottomColor: t.border }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.statusDot, { backgroundColor: online ? t.success : t.danger }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{d?.hostname || selectedServer?.host || 'NAS 系统管理'}</Text>
            <Text style={[styles.subtitle, { color: t.textMuted }]}>
              {online ? '在线' : '离线'} · {selectedServer?.host}
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
          <TouchableOpacity onPress={() => selectedServer && load(selectedServer, true)} disabled={loading || refreshing} style={styles.headerBtn}>
            <Icon name="refresh" size={20} color={t.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => selectedServer && load(selectedServer, true)} colors={[t.primary]} tintColor={t.primary} />}
        contentContainerStyle={styles.scroll}
      >
        {error && (
          <View style={[styles.errCard, { backgroundColor: t.danger + '15', borderColor: t.danger }]}>
            <Text style={[styles.errText, { color: t.danger }]}>{error}</Text>
            <TouchableOpacity onPress={() => selectedServer && load(selectedServer)}><Text style={[styles.retry, { color: t.danger }]}>重试</Text></TouchableOpacity>
          </View>
        )}

        {d && (
          <>
            <View style={styles.statsRow}>
              <StatGauge
                icon="cpu" label="CPU" value={d.cpuPercent}
                display={`${d.cpuPercent.toFixed(0)}%`}
                sublabel={`${d.cpuCores}核 / ${d.cpuThreads}线程`}
                color={t.primary} theme={t}
              />
              <StatGauge
                icon="memory" label="内存"
                value={d.memoryPercent}
                display={`${d.memoryPercent.toFixed(0)}%`}
                sublabel={`${bytesToGB(d.memoryUsed)} / ${bytesToGB(d.memoryTotal)} GB`}
                color={t.success} theme={t}
              />
              <StatGauge
                icon="database" label="阵列"
                value={getArrayUsagePercent(d)}
                display={`${getArrayUsagePercent(d).toFixed(0)}%`}
                sublabel={getArrayUsageSub(d)}
                color={t.warning} theme={t}
              />
            </View>

            {d.uptime && (
              <View style={[styles.infoCard, { backgroundColor: t.card, borderColor: t.border }]}>
                <Icon name="monitor" size={16} color={t.textMuted} />
                <Text style={[styles.infoText, { color: t.textSecondary }]}>
                  <Text style={{ color: t.text, fontWeight: '600' }}>运行时间</Text> · {formatUptime(d.uptime)}
                </Text>
              </View>
            )}

            {(d.cpuModel || d.cpuSpeed > 0) && (
              <View style={[styles.infoCard, { backgroundColor: t.card, borderColor: t.border }]}>
                <Icon name="cpu" size={16} color={t.textMuted} />
                <Text style={[styles.infoText, { color: t.textSecondary, flex: 1 }]} numberOfLines={2}>
                  <Text style={{ color: t.text, fontWeight: '600' }}>处理器</Text>
                  {d.cpuModel ? ` · ${d.cpuModel}` : ''}
                  {d.cpuSpeed > 0 ? ` · ${d.cpuSpeed} GHz` : ''}
                </Text>
              </View>
            )}

            {d.array && (
              <>
                {d.array.parities.length > 0 && (
                  <DiskSection title="校验盘" icon="gitBranch" disks={d.array.parities} theme={t} />
                )}
                {d.array.disks.length > 0 && (
                  <DiskSection title="阵列盘" icon="database" disks={d.array.disks} theme={t} />
                )}
                {d.array.caches.length > 0 && (
                  <DiskSection title="缓存盘" icon="memory" disks={d.array.caches} theme={t} />
                )}
                {d.array.parities.length === 0 && d.array.disks.length === 0 && d.array.caches.length === 0 && (
                  <SectionCard title="阵列" icon="database" theme={t}>
                    <Text style={{ color: t.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>无磁盘</Text>
                  </SectionCard>
                )}
              </>
            )}

            <SectionCard title="Docker 容器" icon="boxes" theme={t} badge={d.containers.length > 0 ? { label: `${d.containers.length}`, color: t.primary } : undefined}>
              {d.containers.length === 0 ? (
                <Text style={{ color: t.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>无容器</Text>
              ) : (
                d.containers.map((c) => (
                  <ContainerCard
                    key={c.id}
                    container={c}
                    onStart={(id) => handleContainerAction(id, 'start')}
                    onStop={(id) => handleContainerAction(id, 'stop')}
                    onRestart={(id) => handleContainerAction(id, 'restart')}
                    onDetail={handleContainerDetail}
                    loading={actionLoading === c.id}
                  />
                ))
              )}
            </SectionCard>

            <SectionCard title="虚拟机" icon="serverCog" theme={t} badge={d.vms.length > 0 ? { label: `${d.vms.length}`, color: t.primary } : undefined}>
              {d.vms.length === 0 ? (
                <Text style={{ color: t.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>无虚拟机</Text>
              ) : (
                d.vms.map((vm, idx) => (
                  <VMRow key={vm.id || idx} vm={vm} theme={t} actionLoading={actionLoading === vm.id} onAction={handleVMAction} />
                ))
              )}
            </SectionCard>
          </>
        )}
      </ScrollView>

      <ContainerDetailModal detail={containerDetail} error={containerDetailError} loading={containerDetailLoading} onClose={() => { setContainerDetail(null); setContainerDetailError(null) }} />
      {ExitToast}
    </View>
  )
}

function getArrayUsagePercent(d: DashboardData | null): number {
  if (!d?.array) return 0
  let totalKb = 0, usedKb = 0
  for (const disk of [...d.array.disks, ...d.array.caches]) {
    if (disk.fsSize && disk.fsUsed) {
      totalKb += disk.fsSize
      usedKb += disk.fsUsed
    }
  }
  return totalKb > 0 ? (usedKb / totalKb) * 100 : 0
}

function getArrayUsageSub(d: DashboardData | null): string {
  if (!d?.array) return '无数据'
  let totalKb = 0, usedKb = 0
  for (const disk of [...d.array.disks, ...d.array.caches]) {
    if (disk.fsSize && disk.fsUsed) {
      totalKb += disk.fsSize
      usedKb += disk.fsUsed
    }
  }
  if (totalKb === 0) return '无数据'
  return `${kBToTB(usedKb)} / ${kBToTB(totalKb)} TB`
}

function StatGauge({ icon, label, value, display, sublabel, color, theme }: {
  icon: any; label: string; value: number; display: string; sublabel: string; color: string; theme: any
}) {
  const t = theme
  return (
    <View style={[gaugeStyles.card, { backgroundColor: t.card, borderColor: t.border }]}>
      <View style={gaugeStyles.headerRow}>
        <Icon name={icon} size={14} color={t.textMuted} />
        <Text style={[gaugeStyles.label, { color: t.textMuted }]}>{label}</Text>
      </View>
      <CircularProgress size={76} strokeWidth={7} progress={value / 100} color={color} bgColor={t.border}>
        <Text style={[gaugeStyles.value, { color: t.text }]}>{display}</Text>
      </CircularProgress>
      <Text style={[gaugeStyles.sublabel, { color: t.textSecondary }]} numberOfLines={1}>{sublabel}</Text>
    </View>
  )
}

function SectionCard({ title, icon, theme, badge, children }: { title: string; icon: any; theme: any; badge?: { label: string; color: string }; children: React.ReactNode }) {
  const t = theme
  return (
    <View style={[styles.sectionCard, { backgroundColor: t.card, borderColor: t.border }]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Icon name={icon} size={18} color={t.primary} />
          <Text style={[styles.sectionTitle, { color: t.text }]}>{title}</Text>
        </View>
        {badge ? <View style={[styles.stateBadge, { backgroundColor: badge.color + '22' }]}><Text style={[styles.stateText, { color: badge.color }]}>{badge.label}</Text></View> : null}
      </View>
      {children}
    </View>
  )
}

function DiskSection({ title, icon, disks, theme }: { title: string; icon: any; disks: any[]; theme: any }) {
  const t = theme
  return (
    <SectionCard title={title} icon={icon} theme={t}>
      {disks.map((disk, idx) => (
        <DiskRow key={disk.name || idx} disk={disk} theme={t} last={idx === disks.length - 1} />
      ))}
    </SectionCard>
  )
}

function DiskRow({ disk, theme, last }: { disk: any; theme: any; last: boolean }) {
  const t = theme
  const statusOk = disk.status === 'DISK_OK'
  const isParity = disk.type === 'PARITY'
  const hasFs = !isParity && disk.fsSize && disk.fsSize > 0
  const usedPct = hasFs ? (disk.fsUsed / disk.fsSize) * 100 : 0
  const usedColor = usedPct > 90 ? t.danger : usedPct > 75 ? t.warning : t.primary

  return (
    <View style={[styles.diskRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border }]}>
      <View style={styles.diskHeaderRow}>
        <Text style={[styles.diskName, { color: t.text }]} numberOfLines={1}>
          {disk.name || disk.device}{' '}
          <Text style={[styles.diskDeviceInline, { color: t.textMuted }]}>· {disk.device}</Text>
        </Text>
        <Text style={[styles.diskTempInline, { color: tempColor(disk.temp, t) }]}>{disk.temp > 0 ? `${disk.temp}°C` : '–'}</Text>
        <View style={[styles.diskStatus, { backgroundColor: (statusOk ? t.success : t.warning) + '22' }]}>
          <Text style={[styles.diskStatusText, { color: statusOk ? t.success : t.warning }]}>
            {statusOk ? '正常' : disk.status === 'DISK_NP' ? '离线' : '异常'}
          </Text>
        </View>
      </View>
      {hasFs ? (
        <View style={styles.diskUsageRow}>
          <View style={[styles.diskUsageBarBg, { backgroundColor: t.border }]}>
            <View style={[styles.diskUsageBarFill, { backgroundColor: usedColor, width: `${Math.min(usedPct, 100)}%` }]} />
          </View>
          <Text style={[styles.diskUsageText, { color: t.textSecondary }]}>
            {usedPct.toFixed(1)}% · {formatSizeUnit(disk.fsUsed)} / {formatSizeUnit(disk.fsSize)}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

function VMRow({ vm, theme, actionLoading, onAction }: { vm: any; theme: any; actionLoading: boolean; onAction: (id: string, action: any) => void }) {
  const t = theme
  const isRunning = vm.state === 'running' || vm.state === 'RUNNING'
  return (
    <View style={[vmStyles.row, { borderColor: t.border }]}>
      <View style={[vmStyles.dot, { backgroundColor: isRunning ? t.success : t.textMuted }]} />
      <View style={{ flex: 1 }}>
        <Text style={[vmStyles.name, { color: t.text }]}>{vm.name}</Text>
        <Text style={[vmStyles.state, { color: t.textMuted }]}>{isRunning ? '运行中' : vm.state}</Text>
      </View>
      <View style={vmStyles.actions}>
        {isRunning ? (
          <>
            <TouchableOpacity style={[vmStyles.btn, { borderColor: t.danger }]} onPress={() => onAction(vm.id, 'stop')} disabled={actionLoading}>
              <Text style={[vmStyles.btnText, { color: t.danger }]}>停止</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[vmStyles.btn, { borderColor: t.warning }]} onPress={() => onAction(vm.id, 'restart')} disabled={actionLoading}>
              <Text style={[vmStyles.btnText, { color: t.warning }]}>重启</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[vmStyles.btn, { borderColor: t.textMuted }]} onPress={() => onAction(vm.id, 'pause')} disabled={actionLoading}>
              <Text style={[vmStyles.btnText, { color: t.textMuted }]}>暂停</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[vmStyles.btn, { borderColor: t.success }]} onPress={() => onAction(vm.id, 'start')} disabled={actionLoading}>
            <Text style={[vmStyles.btnText, { color: t.success }]}>启动</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

function ContainerDetailModal({ detail, error, loading, onClose }: { detail: any; error: string | null; loading: boolean; onClose: () => void }) {
  const t = useTheme()
  return (
    <Modal visible={!!detail || loading || !!error} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.panel, { backgroundColor: t.card }]}>
          <View style={modalStyles.header}>
            <Text style={[modalStyles.title, { color: t.text }]} numberOfLines={1}>{detail?.names?.[0]?.replace(/^\//, '') || '容器详情'}</Text>
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
              <DetailRow label="镜像" value={detail.image} theme={t} />
              <DetailRow label="状态" value={detail.state} theme={t} />
              <DetailRow label="运行" value={detail.status} theme={t} />
              {detail.command ? <DetailRow label="启动命令" value={detail.command} theme={t} mono /> : null}
              {detail.created ? <DetailRow label="创建时间" value={formatDate(detail.created)} theme={t} /> : null}
              {detail.autoStart !== undefined ? <DetailRow label="自动启动" value={detail.autoStart ? '是' : '否'} theme={t} /> : null}

              {Array.isArray(detail.mounts) && detail.mounts.length > 0 && (
                <View style={modalStyles.section}>
                  <Text style={[modalStyles.sectionTitle, { color: t.textMuted }]}>挂载点</Text>
                  {detail.mounts.map((m: any, i: number) => {
                    const text = typeof m === 'string' ? m : [m.Source, m.Destination].filter(Boolean).join(' → ')
                    return <Text key={i} style={[modalStyles.monoText, { color: t.text }]} numberOfLines={1}>{text || '–'}</Text>
                  })}
                </View>
              )}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

function DetailRow({ label, value, theme, mono }: { label: string; value: string; theme: any; mono?: boolean }) {
  return (
    <View style={[detailStyles.row, { borderBottomColor: theme.border }]}>
      <Text style={[detailStyles.label, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[detailStyles.value, { color: theme.text }, mono && { fontFamily: 'monospace', fontSize: 12 }]} numberOfLines={3}>{value || '–'}</Text>
    </View>
  )
}

function formatDate(unix: number): string {
  if (!unix || isNaN(unix)) return ''
  try {
    const d = new Date(unix * 1000)
    return d.toLocaleString('zh-CN', { hour12: false })
  } catch { return '' }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 10 },
  pageTitle: { fontSize: 18, fontWeight: '700' },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 4 },
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
  statsRow: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 12, gap: 6 },
  infoCard: { marginHorizontal: 12, marginTop: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontSize: 13, flex: 1 },
  sectionCard: { marginHorizontal: 12, marginTop: 12, borderRadius: 12, padding: 14, borderWidth: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  stateBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  stateText: { fontSize: 12, fontWeight: '600' },
  serverBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 14, marginHorizontal: 20, marginVertical: 4, minWidth: 200 },
  serverBtnText: { fontSize: 14, fontWeight: '600' },
  diskRow: { paddingVertical: 8 },
  diskHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  diskName: { fontSize: 14, fontWeight: '600', flex: 1 },
  diskDeviceInline: { fontSize: 12, fontWeight: '400' },
  diskTempInline: { fontSize: 12, fontWeight: '700' },
  diskStatus: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  diskStatusText: { fontSize: 11, fontWeight: '600' },
  diskUsageRow: { marginTop: 6, gap: 3 },
  diskUsageBarBg: { height: 4, borderRadius: 2, overflow: 'hidden' },
  diskUsageBarFill: { height: '100%', borderRadius: 2 },
  diskUsageText: { fontSize: 11 },
  diskSizeOnly: { fontSize: 12, marginTop: 8 },
})

const gaugeStyles = StyleSheet.create({
  card: { flex: 1, borderRadius: 12, padding: 10, borderWidth: 1, alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  label: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  value: { fontSize: 16, fontWeight: '800' },
  sublabel: { fontSize: 10, marginTop: 6, textAlign: 'center' },
})

const vmStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { fontSize: 14, fontWeight: '600' },
  state: { fontSize: 11, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 6 },
  btn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  btnText: { fontSize: 11, fontWeight: '600' },
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
  toast: { position: 'absolute', left: 0, right: 0, bottom: 120, alignItems: 'center' },
  toastInner: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24 },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})

const detailStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  label: { fontSize: 13, fontWeight: '500', minWidth: 70 },
  value: { fontSize: 13, flex: 1, textAlign: 'right' },
})