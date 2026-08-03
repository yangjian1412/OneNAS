import { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, BackHandler, StyleSheet, TextInput, Alert, Modal, Animated, Switch } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useAria2Store } from '@/stores/aria2Store'
import type { Aria2Task, ServiceConfig } from '@/types'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'

type Tab = 'active' | 'waiting' | 'stopped'

interface Props {
  service: ServiceConfig
  onRequestClose?: () => void
}

const AUTO_REFRESH_MS = 1000

function formatBytes(b: string | number): string {
  const n = Number(b) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function formatSpeed(bps: string | number): string {
  return `${formatBytes(bps)}/s`
}

function parseSpeedToBytes(s: string): number {
  const t = s.trim().toUpperCase()
  const m = t.match(/^([\d.]+)\s*([KMGT]?B?)\/?S?$/)
  if (!m) return 0
  const n = parseFloat(m[1])
  const unit = m[2] || ''
  const mul = unit === 'K' || unit === 'KB' ? 1024
    : unit === 'M' || unit === 'MB' ? 1024 ** 2
    : unit === 'G' || unit === 'GB' ? 1024 ** 3
    : 1
  return Math.round(n * mul)
}

function bytesToHuman(n: number): string {
  if (!n || n <= 0) return '0'
  if (n < 1024) return `${n}`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)}K`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)}M`
  return `${(n / 1024 ** 3).toFixed(2)}G`
}

function fileName(task: Aria2Task): string {
  if (task.files && task.files.length > 0) {
    const path = task.files[0].path || ''
    const name = path.split('/').filter(Boolean).pop()
    if (name) return name
    if (task.files[0].uris && task.files[0].uris[0]) return task.files[0].uris[0].uri
  }
  return task.gid
}

export default function Aria2Screen({ service, onRequestClose }: Props) {
  const t = useTheme()
  const {
    server, version, globalStat, globalOption,
    active, waiting, stopped,
    isLoading, error,
    loadHome, refresh,
    pause, unpause, remove, forceRemove, addUri,
    loadGlobalOption, saveGlobalOption,
    initWithService, autoRefresh, setAutoRefresh,
  } = useAria2Store()

  const [tab, setTab] = useState<Tab>('active')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addUrls, setAddUrls] = useState('')
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const lastBackPressRef = useRef(0)
  const toastAnim = useRef(new Animated.Value(0)).current
  const isFocused = useIsFocused()

  useEffect(() => {
    if (isFocused) void initWithService(service)
  }, [isFocused, initWithService, service])

  useEffect(() => {
    if (!isFocused || !autoRefresh || !server) return
    const t = setInterval(() => { void refreshRef.current() }, AUTO_REFRESH_MS)
    return () => clearInterval(t)
  }, [isFocused, autoRefresh, server])

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
      Alert.alert('提示', '请输入至少一个 URL')
      return
    }
    const gid = await addUri(urls)
    if (gid) {
      setAddUrls('')
      setAddOpen(false)
    } else {
      Alert.alert('错误', '添加失败，请检查 Aria2 配置')
    }
  }, [addUrls, addUri])

  const tasks = tab === 'active' ? active : tab === 'waiting' ? waiting : stopped

  if (!server) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Icon name="downloadCloud" size={64} style={{ marginBottom: 12 }} />
        <Text style={[styles.title, { color: t.text }]}>Aria2 未配置</Text>
        <Text style={[styles.sub, { color: t.textMuted }]}>请在设置 → 标签设置 配置 Aria2 服务</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={[styles.header, { backgroundColor: t.card, borderBottomColor: t.border }]}>
        <TouchableOpacity onPress={() => setDrawerOpen(true)} style={styles.iconBtn}>
          <Icon name="menu" size={24} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: t.text }]}>Aria2</Text>
        </View>
        <View style={styles.autoRefreshBox}>
          <Text style={[styles.autoRefreshLabel, { color: t.textMuted }]}>自动</Text>
          <Switch
            value={autoRefresh}
            onValueChange={setAutoRefresh}
            trackColor={{ false: t.border, true: t.primary + '88' }}
            thumbColor={autoRefresh ? t.primary : '#f4f3f4'}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
          <TouchableOpacity onPress={() => { void refresh() }} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="refresh" size={20} />
          </TouchableOpacity>
        </View>
      </View>

      {globalStat ? (
        <View style={[styles.statRow, { backgroundColor: t.card, borderBottomColor: t.border }]}>
          <Stat label="下载" value={formatSpeed(globalStat.downloadSpeed)} color={t.primary} t={t} />
          <Stat label="上传" value={formatSpeed(globalStat.uploadSpeed)} color={t.textMuted} t={t} />
          <Stat label="活动" value={String(globalStat.numActive || 0)} color={t.text} t={t} />
          <Stat label="等待" value={String(globalStat.numWaiting || 0)} color={t.text} t={t} />
          <Stat label="停止" value={String(globalStat.numStopped || 0)} color={t.text} t={t} />
        </View>
      ) : null}

      <View style={[styles.tabRow, { backgroundColor: t.card, borderBottomColor: t.border }]}>
        {(['active', 'waiting', 'stopped'] as Tab[]).map((k) => (
          <TouchableOpacity key={k} style={[styles.tab, tab === k && { borderBottomColor: t.primary }]} onPress={() => setTab(k)}>
            <Text style={[styles.tabText, { color: tab === k ? t.primary : t.textMuted }]}>
              {k === 'active' ? `下载中 (${active.length})` : k === 'waiting' ? `等待 (${waiting.length})` : `已完成 (${stopped.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: (t.warning || '#f0a020') + '22' }]}>
          <Text style={{ color: t.warning || '#a06000' }}>{error}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 32 }}>
        {isLoading && tasks.length === 0 ? (
          <View style={styles.center}><ActivityIndicator size="large" color={t.primary} /></View>
        ) : tasks.length === 0 ? (
          <Text style={[styles.empty, { color: t.textMuted }]}>
            {tab === 'active' ? '无正在下载的任务' : tab === 'waiting' ? '无等待中的任务' : '无已完成/失败的任务'}
          </Text>
        ) : (
          tasks.map((task) => (
            <TaskRow key={task.gid} task={task} tab={tab} t={t}
              onPause={() => void pause(task.gid)}
              onUnpause={() => void unpause(task.gid)}
              onRemove={() => {
                Alert.alert('删除任务', `确定要删除 "${fileName(task)}" 吗？`, [
                  { text: '取消', style: 'cancel' },
                  { text: '删除', style: 'destructive', onPress: () => { void remove(task.gid) } },
                ])
              }}
              onForceRemove={() => {
                Alert.alert('强制删除', `确定要强制删除 "${fileName(task)}" 吗？`, [
                  { text: '取消', style: 'cancel' },
                  { text: '强制删除', style: 'destructive', onPress: () => { void forceRemove(task.gid) } },
                ])
              }}
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
            <Text style={[styles.sheetTitle, { color: t.text }]}>添加下载</Text>
            <TextInput
              multiline
              autoFocus
              style={[styles.addInput, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
              value={addUrls}
              onChangeText={setAddUrls}
              placeholder="http(s)://... 每行一个 URL"
              placeholderTextColor={t.textMuted}
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity onPress={() => setAddOpen(false)}><Text style={[styles.actionText, { color: t.textMuted }]}>取消</Text></TouchableOpacity>
              <TouchableOpacity onPress={onAddSubmit}><Text style={[styles.actionText, { color: t.primary }]}>下载</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
        <View style={styles.modalRoot}>
          <TouchableOpacity style={styles.backdrop} onPress={() => setDrawerOpen(false)} activeOpacity={1} />
          <View style={[styles.drawer, { backgroundColor: t.card }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.drawerTitle, { color: t.text }]}>{server.name}</Text>
              <TouchableOpacity onPress={() => setDrawerOpen(false)} style={{ padding: 4 }}>
                <Icon name="x" size={20} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.drawerSub, { color: t.textMuted }]}>{server.url}</Text>
            {version ? <Text style={[styles.drawerSub, { color: t.textMuted }]}>aria2 v{version}</Text> : null}
            <TouchableOpacity style={[styles.drawerItem, { borderColor: t.border }]} onPress={() => { setDrawerOpen(false); void loadGlobalOption().then(() => setSettingsOpen(true)) }}>
              <Icon name="settings" size={20} />
              <Text style={[styles.drawerItemText, { color: t.text }]}>下载设置</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        globalOption={globalOption}
        onSave={async (opt) => {
          const ok = await saveGlobalOption(opt)
          if (ok) Alert.alert('完成', '设置已保存')
          else Alert.alert('错误', '保存失败')
          return ok
        }}
        t={t}
      />
    </View>
  )
}

function Stat({ label, value, color, t }: { label: string; value: string; color: string; t: any }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: t.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]} numberOfLines={1}>{value}</Text>
    </View>
  )
}

function TaskRow({ task, tab, t, onPause, onUnpause, onRemove, onForceRemove }: {
  task: Aria2Task
  tab: Tab
  t: any
  onPause: () => void
  onUnpause: () => void
  onRemove: () => void
  onForceRemove: () => void
}) {
  const total = Number(task.totalLength) || 0
  const done = Number(task.completedLength) || 0
  const pct = total > 0 ? done / total : 0
  const isPaused = task.status === 'paused'
  const isActive = tab === 'active'
  return (
    <View style={[styles.taskCard, { backgroundColor: t.card, borderColor: t.border }]}>
      <Text style={[styles.taskName, { color: t.text }]} numberOfLines={2}>{fileName(task)}</Text>
      <View style={[styles.progressBg, { backgroundColor: t.border }]}>
        <View style={[styles.progressFill, { backgroundColor: t.primary, width: `${Math.min(100, pct * 100)}%` }]} />
      </View>
      <View style={styles.taskMeta}>
        <Text style={[styles.metaText, { color: t.textMuted }]}>{formatBytes(done)} / {formatBytes(total)}</Text>
        {Number(task.downloadSpeed) > 0 ? <Text style={[styles.metaText, { color: t.textMuted }]}>{formatSpeed(task.downloadSpeed)}</Text> : null}
        {task.errorMessage ? <Text style={[styles.metaText, { color: '#c0392b' }]} numberOfLines={1}>{task.errorMessage}</Text> : null}
      </View>
      <View style={styles.taskActions}>
        {isActive && !isPaused ? (
          <TouchableOpacity onPress={onPause} style={[styles.btn, { backgroundColor: t.border }]}><Text style={[styles.btnText, { color: t.text }]}>暂停</Text></TouchableOpacity>
        ) : isActive && isPaused ? (
          <TouchableOpacity onPress={onUnpause} style={[styles.btn, { backgroundColor: t.primary }]}><Text style={[styles.btnText, { color: '#fff' }]}>继续</Text></TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={onRemove} style={[styles.btn, { backgroundColor: t.border }]}><Text style={[styles.btnText, { color: t.text }]}>删除</Text></TouchableOpacity>
        <TouchableOpacity onPress={onForceRemove} style={[styles.btn, { backgroundColor: t.border }]}><Text style={[styles.btnText, { color: '#c0392b' }]}>强制删除</Text></TouchableOpacity>
      </View>
    </View>
  )
}

interface SettingsModalProps {
  visible: boolean
  onClose: () => void
  globalOption: Record<string, string>
  onSave: (opt: Record<string, string>) => Promise<boolean>
  t: any
}

function SettingsModal({ visible, onClose, globalOption, onSave, t }: SettingsModalProps) {
  const [maxOverallDl, setMaxOverallDl] = useState('')
  const [maxOverallUp, setMaxOverallUp] = useState('')
  const [maxDl, setMaxDl] = useState('')
  const [maxUp, setMaxUp] = useState('')
  const [concurrent, setConcurrent] = useState('')

  useEffect(() => {
    if (!visible) return
    setMaxOverallDl(globalOption['max-overall-download-limit'] || '')
    setMaxOverallUp(globalOption['max-overall-upload-limit'] || '')
    setMaxDl(globalOption['max-download-limit'] || '')
    setMaxUp(globalOption['max-upload-limit'] || '')
    setConcurrent(globalOption['max-concurrent-downloads'] || '')
  }, [visible, globalOption])

  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const opt: Record<string, string> = {}
    if (maxOverallDl.trim()) opt['max-overall-download-limit'] = String(parseSpeedToBytes(maxOverallDl) || 0)
    if (maxOverallUp.trim()) opt['max-overall-upload-limit'] = String(parseSpeedToBytes(maxOverallUp) || 0)
    if (maxDl.trim()) opt['max-download-limit'] = String(parseSpeedToBytes(maxDl) || 0)
    if (maxUp.trim()) opt['max-upload-limit'] = String(parseSpeedToBytes(maxUp) || 0)
    if (concurrent.trim()) opt['max-concurrent-downloads'] = concurrent.trim()
    const ok = await onSave(opt)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={[styles.sheet, { backgroundColor: t.card }]}>
          <Text style={[styles.sheetTitle, { color: t.text }]}>下载设置</Text>
          <Text style={[styles.fieldHint, { color: t.textMuted }]}>单位：K=KB/s · M=MB/s · G=GB/s（留空 = 不限）</Text>

          <Text style={[styles.fieldLabel, { color: t.textSecondary, marginTop: 6 }]}>全局下载限速</Text>
          <TextInput style={[styles.settingInput, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
            value={maxOverallDl} onChangeText={setMaxOverallDl}
            placeholder={globalOption['max-overall-download-limit'] ? bytesToHuman(Number(globalOption['max-overall-download-limit'])) : '不限'}
            placeholderTextColor={t.textMuted} autoCapitalize="none" />

          <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>全局上传限速</Text>
          <TextInput style={[styles.settingInput, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
            value={maxOverallUp} onChangeText={setMaxOverallUp}
            placeholder={globalOption['max-overall-upload-limit'] ? bytesToHuman(Number(globalOption['max-overall-upload-limit'])) : '不限'}
            placeholderTextColor={t.textMuted} autoCapitalize="none" />

          <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>单任务下载限速</Text>
          <TextInput style={[styles.settingInput, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
            value={maxDl} onChangeText={setMaxDl}
            placeholder={globalOption['max-download-limit'] ? bytesToHuman(Number(globalOption['max-download-limit'])) : '不限'}
            placeholderTextColor={t.textMuted} autoCapitalize="none" />

          <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>单任务上传限速</Text>
          <TextInput style={[styles.settingInput, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
            value={maxUp} onChangeText={setMaxUp}
            placeholder={globalOption['max-upload-limit'] ? bytesToHuman(Number(globalOption['max-upload-limit'])) : '不限'}
            placeholderTextColor={t.textMuted} autoCapitalize="none" />

          <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>最大并发下载数</Text>
          <TextInput style={[styles.settingInput, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
            value={concurrent} onChangeText={setConcurrent}
            placeholder={globalOption['max-concurrent-downloads'] || '5'}
            placeholderTextColor={t.textMuted} keyboardType="number-pad" />

          <View style={styles.sheetActions}>
            <TouchableOpacity onPress={onClose}><Text style={[styles.actionText, { color: t.textMuted }]}>取消</Text></TouchableOpacity>
            <TouchableOpacity onPress={handleSave} disabled={saving}><Text style={[styles.actionText, { color: t.primary }]}>{saving ? '保存中…' : '保存'}</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 4, textAlign: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  iconBtn: { padding: 8, borderRadius: 8 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerSub: { fontSize: 11, marginTop: 2 },
  autoRefreshBox: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  autoRefreshLabel: { fontSize: 11 },

  statRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 13, fontWeight: '600', marginTop: 2 },

  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 13, fontWeight: '600' },

  errorBanner: { padding: 8, marginHorizontal: 12, marginTop: 8, borderRadius: 8 },

  taskCard: { padding: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, marginBottom: 10 },
  taskName: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  progressBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6 },
  taskMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 12 },
  metaText: { fontSize: 12 },
  taskActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  btnText: { fontSize: 12, fontWeight: '600' },

  empty: { textAlign: 'center', marginTop: 32, fontSize: 13 },

  fab: { position: 'absolute', right: 20, bottom: 28, width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', elevation: 4 },

  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 32 },
  sheetTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  addInput: { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 120, fontSize: 13, textAlignVertical: 'top', fontFamily: 'monospace' },
  settingInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  fieldHint: { fontSize: 11, marginBottom: 10 },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, paddingTop: 16 },
  actionText: { fontSize: 14, fontWeight: '600' },

  drawer: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 280, padding: 18, paddingTop: 48 },
  drawerTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  drawerSub: { fontSize: 12, marginBottom: 4 },
  drawerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  drawerItemText: { fontSize: 15, fontWeight: '500' },
})