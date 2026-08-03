import { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, BackHandler, StyleSheet, TextInput, Alert, Modal, Animated } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useOpenListStore } from '@/stores/openlistStore'
import { useAppStore } from '@/stores/appStore'
import type { OpenListFile, ServiceConfig } from '@/types'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import ServiceDrawer, { DrawerItem } from '@/components/ServiceDrawer'

interface Props {
  service: ServiceConfig
  onRequestClose?: () => void
}

function formatSize(n: number): string {
  if (!n || n < 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export default function OpenListScreen({ service, onRequestClose }: Props) {
  const t = useTheme()
  const {
    server, path, files, loading, error,
    cd, up, refresh, mkdir, remove, initWithService,
    getDownloader, setDownloader,
  } = useOpenListStore()

  const [mkdirOpen, setMkdirOpen] = useState(false)
  const [mkdirName, setMkdirName] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  // 下载工具设置抽屉
  const [dlOpen, setDlOpen] = useState(false)
  const [dlUrl, setDlUrl] = useState('')
  const [dlSecret, setDlSecret] = useState('')
  const lastBackPressRef = useRef(0)
  const isFocused = useIsFocused()

  useEffect(() => {
    if (isFocused) void initWithService(service)
  }, [isFocused, initWithService, service])

  useEffect(() => {
    if (dlOpen) {
      void getDownloader().then((dl) => {
        setDlUrl(dl?.url ?? '')
        setDlSecret(dl?.secret ?? '')
      })
    }
  }, [dlOpen, getDownloader])

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isFocused) return false
      if (mkdirOpen) { setMkdirOpen(false); return true }
      if (dlOpen) { setDlOpen(false); return true }
      if (drawerOpen) { setDrawerOpen(false); return true }
      if (path !== '/') { void up(); return true }
      const now = Date.now()
      if (now - lastBackPressRef.current < 2000) return false
      lastBackPressRef.current = now
      return true
    })
    return () => sub.remove()
  }, [isFocused, mkdirOpen, dlOpen, drawerOpen, path])

  const onMkdirSubmit = useCallback(async () => {
    if (!mkdirName.trim()) return
    const ok = await mkdir(mkdirName.trim())
    if (ok) { setMkdirName(''); setMkdirOpen(false) }
    else Alert.alert('错误', '创建失败')
  }, [mkdirName, mkdir])

  const onDlSave = useCallback(async () => {
    const url = dlUrl.trim().replace(/\/+$/, '')
    const secret = dlSecret.trim()
    if (!url) {
      await setDownloader(null)
      setDlOpen(false)
      Alert.alert('提示', '已清空下载工具配置')
      return
    }
    await setDownloader({ type: 'aria2', url, secret })
    setDlOpen(false)
  }, [dlUrl, dlSecret, setDownloader])

  if (!server) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Icon name="openlist" size={64} style={{ marginBottom: 12 }} />
        <Text style={[styles.title, { color: t.text }]}>OpenList 未配置</Text>
        <Text style={[styles.sub, { color: t.textMuted }]}>请在设置 → 标签设置 配置 OpenList 服务</Text>
      </View>
    )
  }

  const drawerItems: DrawerItem[] = [
    { key: 'downloader', label: '下载工具设置', icon: 'downloadRounded', onPress: () => setDlOpen(true) },
    { key: 'refresh', label: '刷新', icon: 'refresh', onPress: () => { void refresh() } },
    { key: 'mkdir', label: '新建文件夹', icon: 'plus', onPress: () => setMkdirOpen(true) },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={[styles.header, { backgroundColor: t.card, borderBottomColor: t.border }]}>
        <TouchableOpacity onPress={() => setDrawerOpen(true)} style={styles.iconBtn}>
          <Icon name="menu" size={24} />
        </TouchableOpacity>
        <View style={{ flex: 1, paddingHorizontal: 8, alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: t.text }]} numberOfLines={1}>{server.name}</Text>
          <Text style={[styles.headerSub, { color: t.textMuted }]} numberOfLines={1}>{server.token ? '已登录（admin）' : '未配置 Token（访客/只读）'}</Text>
        </View>
        <TouchableOpacity onPress={() => { void refresh() }} style={styles.iconBtn}>
          <Icon name="refresh" size={22} />
        </TouchableOpacity>
      </View>

      <Breadcrumbs path={path} onJump={(p) => void cd(p)} t={t} />

      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: (t.warning || '#f0a020') + '22' }]}>
          <Text style={{ color: t.warning || '#a06000' }}>{error}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 32 }}>
        {loading && files.length === 0 ? (
          <View style={styles.center}><ActivityIndicator size="large" color={t.primary} /></View>
        ) : files.length === 0 ? (
          <Text style={[styles.empty, { color: t.textMuted }]}>空目录</Text>
        ) : (
          files.map((f) => (
            <Row key={f.path} file={f} t={t}
              onPress={() => {
                if (f.is_dir) {
                  console.log('[OpenList] cd ->', f.path)
                  void cd(f.path)
                }
              }}
              onDelete={() => {
                Alert.alert('删除', `确定要删除 "${f.name}" 吗？`, [
                  { text: '取消', style: 'cancel' },
                  { text: '删除', style: 'destructive', onPress: () => { void remove([f.name], f.is_dir) } },
                ])
              }}
            />
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={[styles.fab, { backgroundColor: t.primary }]} onPress={() => setMkdirOpen(true)}>
        <Icon name="plus" size={26} color="#fff" />
      </TouchableOpacity>

      <ServiceDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="OpenList"
        subtitle="网盘管理"
        items={drawerItems}
        t={t}
      />

      <Modal visible={mkdirOpen} transparent animationType="slide" onRequestClose={() => setMkdirOpen(false)}>
        <View style={styles.modalRoot}>
          <TouchableOpacity style={styles.backdrop} onPress={() => setMkdirOpen(false)} activeOpacity={1} />
          <View style={[styles.sheet, { backgroundColor: t.card }]}>
            <Text style={[styles.sheetTitle, { color: t.text }]}>新建文件夹</Text>
            <TextInput
              autoFocus
              style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
              value={mkdirName}
              onChangeText={setMkdirName}
              placeholder="文件夹名"
              placeholderTextColor={t.textMuted}
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity onPress={() => setMkdirOpen(false)}><Text style={[styles.actionText, { color: t.textMuted }]}>取消</Text></TouchableOpacity>
              <TouchableOpacity onPress={onMkdirSubmit}><Text style={[styles.actionText, { color: t.primary }]}>创建</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={dlOpen} transparent animationType="slide" onRequestClose={() => setDlOpen(false)}>
        <View style={styles.modalRoot}>
          <TouchableOpacity style={styles.backdrop} onPress={() => setDlOpen(false)} activeOpacity={1} />
          <View style={[styles.sheet, { backgroundColor: t.card }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={[styles.sheetTitle, { color: t.text }]}>下载工具设置</Text>
              <TouchableOpacity onPress={() => setDlOpen(false)} style={{ padding: 4 }}>
                <Icon name="x" size={20} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.dlHint, { color: t.textMuted }]}>配置 OpenList 后台的下载工具（aria2），以便向 OpenList 推送下载任务。</Text>

            <Aria2ImportButton t={t} onImported={(url, secret) => { setDlUrl(url); setDlSecret(secret) }} />

            <Text style={[styles.dlLabel, { color: t.text }]}>RPC 地址（JSON-RPC）</Text>
            <TextInput
              style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
              value={dlUrl}
              onChangeText={setDlUrl}
              placeholder="http://host:6800/jsonrpc"
              placeholderTextColor={t.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[styles.dlLabel, { color: t.text }]}>RPC 密钥（rpc-secret，可选）</Text>
            <TextInput
              style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
              value={dlSecret}
              onChangeText={setDlSecret}
              placeholder="请输入 aria2 rpc-secret"
              placeholderTextColor={t.textMuted}
              secureTextEntry
            />

            <View style={styles.sheetActions}>
              <TouchableOpacity onPress={onDlSave}><Text style={[styles.actionText, { color: t.primary }]}>保存</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function Row({ file, t, onPress, onDelete }: { file: OpenListFile; t: any; onPress: () => void; onDelete: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} onLongPress={onDelete} style={[styles.row, { backgroundColor: t.card, borderColor: t.border }]}>
      <Icon name={file.is_dir ? 'folderContent' : 'file'} size={22} style={{ marginRight: 10 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.fileName, { color: t.text }]} numberOfLines={1}>{file.name}</Text>
        {!file.is_dir ? <Text style={[styles.fileMeta, { color: t.textMuted }]}>{formatSize(file.size)}{file.modified ? `  ·  ${file.modified}` : ''}</Text> : null}
      </View>
      {file.is_dir ? <Icon name="chevronRight" size={18} /> : null}
    </TouchableOpacity>
  )
}

function Aria2ImportButton({ t, onImported }: { t: any; onImported: (url: string, secret: string) => void }) {
  const services = useAppStore(s => s.services)
  const aria2 = services.find(s => s.type === 'aria2')
  if (!aria2) return null
  const rpcUrl = (aria2.url || '').replace(/\/+$/, '')
  const secret = aria2.apiKey || aria2.password || ''
  return (
    <TouchableOpacity
      style={[styles.importBtn, { backgroundColor: (t.primary || '#2196f3') + '18', borderColor: t.primary || '#2196f3' }]}
      onPress={() => onImported(rpcUrl, secret)}
    >
      <Icon name="downloadRounded" size={16} style={{ marginRight: 6 }} />
      <Text style={[styles.importBtnText, { color: t.primary || '#2196f3' }]}>一键导入 aria2 配置</Text>
    </TouchableOpacity>
  )
}

function Breadcrumbs({ path, onJump, t }: { path: string; onJump: (p: string) => void; t: any }) {
  const segs = path.split('/').filter(Boolean)
  // 首段：根
  const items: { label: string; full: string }[] = [{ label: '根', full: '/' }]
  let acc = ''
  for (const s of segs) { acc += '/' + s; items.push({ label: s, full: acc }) }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.breadcrumbBar, { backgroundColor: t.card, borderBottomColor: t.border }]}
      contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 12 }}
    >
      {items.map((it, idx) => (
        <View key={idx} style={{ flexDirection: 'row', alignItems: 'center' }}>
          {idx > 0 ? <Text style={[styles.breadcrumbSep, { color: t.textMuted }]}>{' / '}</Text> : null}
          <TouchableOpacity onPress={() => onJump(it.full)}>
            <Text style={[styles.breadcrumbText, { color: t.primary }]} numberOfLines={1}>{it.label}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
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
  headerPath: { fontSize: 11, marginTop: 2 },

  errorBanner: { padding: 8, marginHorizontal: 12, marginTop: 8, borderRadius: 8 },

  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  fileName: { fontSize: 14, fontWeight: '500' },
  fileMeta: { fontSize: 11, marginTop: 2 },

  empty: { textAlign: 'center', marginTop: 32, fontSize: 13 },

  fab: { position: 'absolute', right: 20, bottom: 28, width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', elevation: 4 },

  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 32 },
  sheetTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
  dlHint: { fontSize: 12, marginBottom: 14, lineHeight: 17 },
  dlLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, paddingTop: 16 },
  actionText: { fontSize: 14, fontWeight: '600' },
  importBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: 8, borderWidth: 1, marginBottom: 12 },
  importBtnText: { fontSize: 13, fontWeight: '600' },
  breadcrumbBar: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  breadcrumbText: { fontSize: 13, fontWeight: '600' },
  breadcrumbSep: { fontSize: 13 },
})