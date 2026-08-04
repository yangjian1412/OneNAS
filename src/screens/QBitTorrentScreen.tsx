import { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, BackHandler, StyleSheet, TextInput, Alert, Modal, Animated } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useQBitStore } from '@/stores/qbittorrentStore'
import { qbitGetPreferences, qbitSetPreferences } from '@/lib/api/qbittorrent'
import type { QBitTorrentTask, ServiceConfig } from '@/types'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import ServiceHeader from '@/components/ServiceHeader'
import ServiceDrawer, { DrawerItem } from '@/components/ServiceDrawer'
import FullScreenModal from '@/components/FullScreenModal'

interface Props {
  service: ServiceConfig
  onRequestClose?: () => void
}

function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`
}

function formatEta(seconds: number): string {
  if (!seconds || seconds < 0 || seconds > 8640000) return '∞'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function parseSpeedToBytes(s: string): number {
  const t = s.trim().toUpperCase()
  const m = t.match(/^([\d.]+)\s*([KMGT]?B?)\/?S?$/)
  if (!m) return -1
  const n = parseFloat(m[1])
  const unit = m[2] || ''
  const mul = unit === 'K' || unit === 'KB' ? 1024
    : unit === 'M' || unit === 'MB' ? 1024 ** 2
    : unit === 'G' || unit === 'GB' ? 1024 ** 3
    : 1
  return Math.round(n * mul)
}

function bytesToHuman(n: number): string {
  if (n === undefined || n === null) return ''
  if (n < 0 || n === 0) return '不限'
  if (n < 1024) return `${n}`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)}K`
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)}M`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}G`
}

const STATE_LABELS: Record<string, string> = {
  downloading: '下载中',
  uploading: '上传中',
  paused: '已暂停',
  completed: '已完成',
  error: '错误',
  missingFiles: '文件丢失',
}

export default function QBitTorrentScreen({ service, onRequestClose }: Props) {
  const t = useTheme()
  const {
    server, tasks, filter, isLoading, error,
    loadHome, refresh, addUrl, pause, resume, remove, recheck,
    setFilter, initWithService, autoRefresh, setAutoRefresh,
  } = useQBitStore()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addUrls, setAddUrls] = useState('')
  const lastBackPressRef = useRef(0)
  const toastAnim = useRef(new Animated.Value(0)).current
  const isFocused = useIsFocused()
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    if (isFocused) void initWithService(service)
  }, [isFocused, initWithService, service])

  useEffect(() => {
    if (!isLoading) hasLoadedOnce.current = true
  }, [isLoading])

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isFocused) return false
      if (settingsOpen) { setSettingsOpen(false); return true }
      if (addOpen) { setAddOpen(false); return true }
      if (drawerOpen) { setDrawerOpen(false); return true }
      const now = Date.now()
      if (now - lastBackPressRef.current < 2000) return false
      lastBackPressRef.current = now
      return true
    })
    return () => sub.remove()
  }, [isFocused, settingsOpen, addOpen, drawerOpen])

  const onAddSubmit = useCallback(async () => {
    const urls = addUrls.split(/\s+/).map((s) => s.trim()).filter(Boolean)
    if (urls.length === 0) {
      Alert.alert('提示', '请输入至少一个 magnet 或 URL')
      return
    }
    const ok = await addUrl(urls)
    if (ok) {
      setAddUrls('')
      setAddOpen(false)
    } else {
      Alert.alert('错误', '添加失败，请检查配置或网络')
    }
  }, [addUrls, addUrl])

  if (!server) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Icon name="qbittorrent" size={64} style={{ marginBottom: 12 }} />
        <Text style={[styles.title, { color: t.text }]}>qBittorrent 未配置</Text>
        <Text style={[styles.sub, { color: t.textMuted }]}>请在设置 → 标签设置 配置 qBittorrent 服务</Text>
      </View>
    )
  }

  const drawerItems: DrawerItem[] = [
    { key: 'settings', label: '基本设置', icon: 'settings', onPress: () => setSettingsOpen(true) },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ServiceHeader
        mode="download"
        t={t}
        title={server.name}
        onMenuPress={() => setDrawerOpen(true)}
        autoRefresh={autoRefresh}
        setAutoRefresh={setAutoRefresh}
        onRefresh={() => { void refresh() }}
      />

      <View style={[styles.tabRow, { backgroundColor: t.card, borderBottomColor: t.border }]}>
        {([
          { key: 'all', label: `全部 (${filter === 'all' ? tasks.length : '...'})` },
          { key: 'downloading', label: `下载 (${filter === 'downloading' ? tasks.length : '...'})` },
          { key: 'completed', label: `完成 (${filter === 'completed' ? tasks.length : '...'})` },
          { key: 'paused', label: `暂停 (${filter === 'paused' ? tasks.length : '...'})` },
        ] as const).map((it) => (
          <TouchableOpacity key={it.key} style={[styles.tab, filter === it.key && { borderBottomColor: t.primary }]} onPress={() => setFilter(it.key as any)}>
            <Text style={[styles.tabText, { color: filter === it.key ? t.primary : t.textMuted }]}>{it.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: (t.warning || '#f0a020') + '22' }]}>
          <Text style={{ color: t.warning || '#a06000' }}>{error}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 32 }}>
        {!hasLoadedOnce.current && isLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={t.primary} /></View>
        ) : tasks.length === 0 ? (
          <Text style={[styles.empty, { color: t.textMuted }]}>暂无任务，点 + 添加磁力链或 URL</Text>
        ) : (
          tasks.map((task) => (
            <TaskRow key={task.hash} task={task} t={t}
              onPause={() => void pause([task.hash])}
              onResume={() => void resume([task.hash])}
              onDelete={() => {
                Alert.alert('删除任务', `确定要删除 "${task.name}" 吗？`, [
                  { text: '取消', style: 'cancel' },
                  { text: '仅删除任务', onPress: () => { void remove([task.hash], false) } },
                  { text: '删除任务+文件', style: 'destructive', onPress: () => { void remove([task.hash], true) } },
                ])
              }}
              onRecheck={() => void recheck([task.hash])}
            />
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={[styles.fab, { backgroundColor: t.primary }]} onPress={() => setAddOpen(true)}>
        <Icon name="plus" size={26} color="#fff" />
      </TouchableOpacity>

      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.modalRoot}>
          <TouchableOpacity style={styles.backdrop} onPress={() => setAddOpen(false)} activeOpacity={1} />
          <View style={[styles.sheet, { backgroundColor: t.card }]}>
            <Text style={[styles.sheetTitle, { color: t.text }]}>添加种子</Text>
            <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>URL / Magnet（每行一个）</Text>
            <TextInput
              multiline
              autoFocus
              style={[styles.addInput, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
              value={addUrls}
              onChangeText={setAddUrls}
              placeholder="magnet:?xt=urn:btih:..."
              placeholderTextColor={t.textMuted}
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity onPress={() => setAddOpen(false)}><Text style={[styles.actionText, { color: t.textMuted }]}>取消</Text></TouchableOpacity>
              <TouchableOpacity onPress={onAddSubmit}><Text style={[styles.actionText, { color: t.primary }]}>添加</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ServiceDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userInfo={{ name: server.name, url: server.url, avatar: server.username || server.name }}
        versionInfo={{ type: 'qBittorrent' }}
        items={drawerItems}
        t={t}
      />

      <SettingsScreen
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        server={server}
        t={t}
      />
    </View>
  )
}

interface SettingsScreenProps {
  visible: boolean
  onClose: () => void
  server: { url: string; username: string; password: string }
  t: any
}

function SettingsScreen({ visible, onClose, server, t }: SettingsScreenProps) {
  const [prefs, setPrefs] = useState<Record<string, any> | null>(null)
  const [maxDl, setMaxDl] = useState('')
  const [maxUp, setMaxUp] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!visible) return
    let active = true
    ;(async () => {
      const p = await qbitGetPreferences(server as any)
      if (!active) return
      if (p) {
        setPrefs(p)
        setMaxDl(p.max_dl_rate != null && p.max_dl_rate > 0 ? bytesToHuman(p.max_dl_rate) : '')
        setMaxUp(p.max_up_rate != null && p.max_up_rate > 0 ? bytesToHuman(p.max_up_rate) : '')
      }
    })()
    return () => { active = false }
  }, [visible, server])

  const handleSave = async () => {
    setSaving(true)
    const next: Record<string, any> = { ...(prefs ?? {}) }
    if (maxDl.trim()) next.max_dl_rate = parseSpeedToBytes(maxDl)
    if (maxUp.trim()) next.max_up_rate = parseSpeedToBytes(maxUp)
    const ok = await qbitSetPreferences(server as any, next)
    setSaving(false)
    if (ok) { Alert.alert('完成', '设置已保存'); onClose() }
    else Alert.alert('错误', '保存失败')
  }

  return (
    <FullScreenModal visible={visible} onClose={onClose} title="基本设置" t={t}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Text style={[styles.fieldHint, { color: t.textMuted }]}>单位：K=KB/s · M=MB/s · G=GB/s（留空 = 不限）</Text>

        <Text style={[styles.fieldLabel, { color: t.textSecondary, marginTop: 6 }]}>全局下载限速</Text>
        <TextInput style={[styles.settingInput, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
          value={maxDl} onChangeText={setMaxDl}
          placeholder={prefs?.max_dl_rate ? bytesToHuman(prefs.max_dl_rate) : '不限'}
          placeholderTextColor={t.textMuted} autoCapitalize="none" />

        <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>全局上传限速</Text>
        <TextInput style={[styles.settingInput, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
          value={maxUp} onChangeText={setMaxUp}
          placeholder={prefs?.max_up_rate ? bytesToHuman(prefs.max_up_rate) : '不限'}
          placeholderTextColor={t.textMuted} autoCapitalize="none" />

        <View style={styles.sheetActions}>
          <TouchableOpacity onPress={onClose}><Text style={[styles.actionText, { color: t.textMuted }]}>取消</Text></TouchableOpacity>
          <TouchableOpacity onPress={handleSave} disabled={saving}><Text style={[styles.actionText, { color: t.primary }]}>{saving ? '保存中…' : '保存'}</Text></TouchableOpacity>
        </View>
      </ScrollView>
    </FullScreenModal>
  )
}

function TaskRow({ task, t, onPause, onResume, onDelete, onRecheck }: {
  task: QBitTorrentTask
  t: any
  onPause: () => void
  onResume: () => void
  onDelete: () => void
  onRecheck: () => void
}) {
  const pct = Math.round((task.progress || 0) * 100)
  const isPaused = task.state === 'paused'
  return (
    <View style={[styles.taskCard, { backgroundColor: t.card, borderColor: t.border }]}>
      <Text style={[styles.taskName, { color: t.text }]} numberOfLines={2}>{task.name}</Text>
      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: t.textMuted }]}>{STATE_LABELS[task.state] ?? task.state}</Text>
        <Text style={[styles.metaText, { color: t.textMuted }]}>{formatBytes(task.size)}</Text>
        <Text style={[styles.metaText, { color: t.textMuted }]}>{pct}%</Text>
      </View>
      <View style={[styles.progressBg, { backgroundColor: t.border }]}>
        <View style={[styles.progressFill, { backgroundColor: t.primary, width: `${pct}%` }]} />
      </View>
      <View style={styles.metaRow}>
        {task.dlspeed > 0 ? <Text style={[styles.metaText, { color: t.primary }]}>↓ {formatSpeed(task.dlspeed)}</Text> : null}
        {task.upspeed > 0 ? <Text style={[styles.metaText, { color: t.textMuted }]}>↑ {formatSpeed(task.upspeed)}</Text> : null}
        {task.eta && task.eta > 0 ? <Text style={[styles.metaText, { color: t.textMuted }]}>剩余 {formatEta(task.eta)}</Text> : null}
      </View>
      <View style={styles.taskActions}>
        {isPaused ? (
          <TouchableOpacity onPress={onResume} style={[styles.btn, { backgroundColor: t.primary }]}><Text style={[styles.btnText, { color: '#fff' }]}>继续</Text></TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onPause} style={[styles.btn, { backgroundColor: t.border }]}><Text style={[styles.btnText, { color: t.text }]}>暂停</Text></TouchableOpacity>
        )}
        <TouchableOpacity onPress={onRecheck} style={[styles.btn, { backgroundColor: t.border }]}><Text style={[styles.btnText, { color: t.text }]}>校验</Text></TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={[styles.btn, { backgroundColor: t.border }]}><Text style={[styles.btnText, { color: '#c0392b' }]}>删除</Text></TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 4, textAlign: 'center' },

  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 13, fontWeight: '600' },

  errorBanner: { padding: 8, marginHorizontal: 12, marginTop: 8, borderRadius: 8 },

  taskCard: { padding: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, marginBottom: 10 },
  taskName: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 12 },
  metaText: { fontSize: 12 },
  progressBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6 },
  taskActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  btnText: { fontSize: 12, fontWeight: '600' },

  empty: { textAlign: 'center', marginTop: 32, fontSize: 13 },

  fab: { position: 'absolute', right: 20, bottom: 28, width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', elevation: 4 },

  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 32 },
  sheetTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  addInput: { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 100, fontSize: 13, textAlignVertical: 'top', fontFamily: 'monospace' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
  settingInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  fieldHint: { fontSize: 11, marginBottom: 10 },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, paddingTop: 16 },
  actionText: { fontSize: 14, fontWeight: '600' },
})