import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, BackHandler, StyleSheet, TextInput, Alert, Modal, KeyboardAvoidingView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useIsFocused } from '@react-navigation/native'
import * as DocumentPicker from 'expo-document-picker'
import { useOpenListStore, joinOpenListPath } from '@/stores/openlistStore'
import { useAppStore } from '@/stores/appStore'
import type { OpenListFile, ServiceConfig } from '@/types'
import { openListGetFileUrl, openListGet, openListList, openListMkdir } from '@/lib/api/openlist'
import { aria2Ping } from '@/lib/api/aria2'
import { checkStoragePermission, openAllFilesSettings, enqueueDownload } from '@/lib/downloadManager'
import { useTheme } from '@/lib/theme'
import Icon, { IconName } from '@/components/Icon'
import ServiceHeader from '@/components/ServiceHeader'
import ServiceDrawer, { DrawerItem } from '@/components/ServiceDrawer'
import OpenListPreviewModal from '@/components/openlist/OpenListPreviewModal'
import FolderPickerModal from '@/components/FolderPickerModal'
import { getFileCategory } from '@/lib/fileTypes'

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

function fileIcon(name: string): IconName {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'fileImage'
  if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(ext)) return 'fileVideo'
  if (['mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a'].includes(ext)) return 'fileAudio'
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return 'fileArchive'
  if (['pdf'].includes(ext)) return 'filePdf'
  if (['txt', 'md', 'log'].includes(ext)) return 'fileText'
  if (['html', 'htm', 'css', 'js', 'ts', 'tsx', 'json', 'xml', 'yml', 'yaml', 'py', 'go', 'c', 'cpp', 'java', 'sh'].includes(ext)) return 'fileCode'
  return 'file'
}

type EditMode = null | 'rename' | 'move' | 'copy'
type OpenListSortBy = 'name' | 'size' | 'modified'
const SORT_LABELS: Record<OpenListSortBy, string> = { name: '名称', size: '大小', modified: '日期' }

export default function OpenListScreen({ service, onRequestClose }: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const addDownload = useAppStore((s) => s.addDownload)
  const {
    server, path, files, loading, error,
    cd, cdByPath, up, refresh, mkdir, remove, rename, move, copy, pushToAria2, upload, initWithService,
    getDownloader, setDownloader,
    multiSelect, selectedPaths, enterMultiSelect, exitMultiSelect, toggleSelect, selectAll,
  } = useOpenListStore()

  const [mkdirOpen, setMkdirOpen] = useState(false)
  const [mkdirName, setMkdirName] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [sortBy, setSortBy] = useState<OpenListSortBy>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [dlOpen, setDlOpen] = useState(false)
  const [dlUrl, setDlUrl] = useState('')
  const [dlSecret, setDlSecret] = useState('')
  const [dlTesting, setDlTesting] = useState(false)
  const [previewFile, setPreviewFile] = useState<OpenListFile | null>(null)

  const [actionItem, setActionItem] = useState<OpenListFile | null>(null)
  const [editMode, setEditMode] = useState<EditMode>(null)
  const [editTarget, setEditTarget] = useState<OpenListFile | null>(null)
  const [editText, setEditText] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerMode, setPickerMode] = useState<'copy' | 'move'>('copy')
  const [pickerExclude, setPickerExclude] = useState<string | undefined>(undefined)

  const [detailItem, setDetailItem] = useState<OpenListFile | null>(null)
  const [detailInfo, setDetailInfo] = useState<OpenListFile | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [storageAccess, setStorageAccess] = useState<boolean | null>(null)
  const [uploading, setUploading] = useState(false)

  const lastBackPressRef = useRef(0)
  const isFocused = useIsFocused()

  useEffect(() => {
    if (isFocused) void initWithService(service)
  }, [isFocused, initWithService, service])

  useEffect(() => {
    checkStoragePermission().then(setStorageAccess).catch(() => setStorageAccess(null))
  }, [])

  useEffect(() => {
    if (dlOpen) {
      void getDownloader().then((dl) => {
        setDlUrl(dl?.url ?? '')
        setDlSecret(dl?.secret ?? '')
      })
    }
  }, [dlOpen, getDownloader])

  const onDlSave = useCallback(async () => {
    const url = dlUrl.trim()
    if (!url) {
      await setDownloader(null)
      setDlOpen(false)
      Alert.alert('提示', '已清空下载工具配置')
      return
    }
    await setDownloader({ type: 'aria2', url, secret: dlSecret.trim() })
    setDlOpen(false)
  }, [dlUrl, dlSecret, setDownloader])

  const onDlTest = useCallback(async () => {
    const url = dlUrl.trim()
    if (!url) { Alert.alert('提示', '请先填写 RPC 地址'); return }
    setDlTesting(true)
    const r = await aria2Ping({ id: 'test', name: 'test', url, secret: dlSecret.trim() })
    setDlTesting(false)
    if (r.ok) Alert.alert('连接成功', `aria2 版本：${r.version ?? 'unknown'}`)
    else Alert.alert('连接失败', r.error ?? '未知错误')
  }, [dlUrl, dlSecret])

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (previewFile) { setPreviewFile(null); return true }
      if (detailItem) { setDetailItem(null); return true }
      if (editMode) { setEditMode(null); return true }
      if (actionItem) { setActionItem(null); return true }
      if (sortOpen) { setSortOpen(false); return true }
      if (dlOpen) { setDlOpen(false); return true }
      if (mkdirOpen) { setMkdirOpen(false); return true }
      if (drawerOpen) { setDrawerOpen(false); return true }
      if (multiSelect) { exitMultiSelect(); return true }
      if (path !== '/') { void up(); return true }
      if (onRequestClose) { onRequestClose(); return true }
      const now = Date.now()
      if (now - lastBackPressRef.current < 2000) return false
      lastBackPressRef.current = now
      return true
    })
    return () => sub.remove()
  }, [previewFile, detailItem, editMode, actionItem, sortOpen, dlOpen, mkdirOpen, drawerOpen, multiSelect, path, up, exitMultiSelect, onRequestClose])

  const filePathOf = useCallback((f: OpenListFile): string => {
    return f.virtual_path ?? f.path ?? joinOpenListPath(path, f.name)
  }, [path])

  const downloadUrlOf = useCallback((f: OpenListFile): string => {
    if (!server) return ''
    return openListGetFileUrl(server, filePathOf(f), f.sign)
  }, [server, filePathOf])

  const sortedFiles = useMemo(() => {
    const arr = [...files]
    arr.sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
      let r = 0
      if (sortBy === 'size') r = (a.size || 0) - (b.size || 0)
      else if (sortBy === 'modified') {
        const ta = Date.parse(a.modified || '') || 0
        const tb = Date.parse(b.modified || '') || 0
        r = ta - tb
      } else {
        r = (a.name || '').localeCompare(b.name || '')
      }
      return sortDir === 'desc' ? -r : r
    })
    return arr
  }, [files, sortBy, sortDir])
  const showStorageError = (msg: string) => {
    if (msg.includes('Permission') || msg.includes('EACCES') || msg.includes('access')) {
      Alert.alert('需要文件访问权限', '下载文件需要「所有文件访问权限」。请在系统设置中开启。', [
        { text: '取消', style: 'cancel' },
        { text: '去设置', onPress: () => { openAllFilesSettings() } },
      ])
    } else {
      Alert.alert('下载失败', msg)
    }
  }

  const latestError = () => useOpenListStore.getState().error

  const onMkdirSubmit = useCallback(async () => {
    if (!mkdirName.trim()) return
    const ok = await mkdir(mkdirName.trim())
    if (ok) { setMkdirName(''); setMkdirOpen(false) }
    else Alert.alert('错误', '创建失败')
  }, [mkdirName, mkdir])

  const pickAndUpload = useCallback(async () => {
    if (uploading) return
    try {
      const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
      const asset = picked.assets?.[0]
      if (!asset) return
      setUploading(true)
      const target = joinOpenListPath(path, asset.name)
      const ok = await upload(target, { uri: asset.uri, name: asset.name, size: asset.size ?? 0, mimeType: asset.mimeType })
      setUploading(false)
      if (ok) Alert.alert('上传成功', asset.name)
      else Alert.alert('上传失败', latestError() ?? '未知错误')
    } catch (e: any) {
      setUploading(false)
      Alert.alert('上传失败', e?.message ?? '未知错误')
    }
  }, [uploading, path, upload])

  const onItemPress = useCallback((f: OpenListFile) => {
    if (multiSelect) {
      toggleSelect(filePathOf(f))
      return
    }
    if (f.is_dir) { void cd(f.name, path); return }
    const cat = getFileCategory(f.name)
    if (cat === 'image' || cat === 'video' || cat === 'audio' || cat === 'text') {
      setPreviewFile(f)
      return
    }
    setActionItem(f)
  }, [multiSelect, filePathOf, toggleSelect, cd, path])

  const onItemLongPress = useCallback((f: OpenListFile) => {
    if (multiSelect) { toggleSelect(filePathOf(f)); return }
    setActionItem(f)
  }, [multiSelect, toggleSelect, filePathOf])

  const enqueueOne = useCallback(async (url: string, fileName: string) => {
    if (!server) return
    try {
      const task = await enqueueDownload(url, fileName, server.token ?? '')
      addDownload(task)
    } catch (e: any) {
      showStorageError(e?.message ?? '')
    }
  }, [server, addDownload])

  const download = useCallback((f: OpenListFile) => {
    if (storageAccess === false) { showStorageError('Permission denied'); return }
    const url = downloadUrlOf(f)
    if (!url) return
    setActionItem(null)
    void (async () => {
      await enqueueOne(url, f.name)
      Alert.alert('已加入下载队列', f.name)
    })()
  }, [storageAccess, downloadUrlOf, enqueueOne])

  const downloadSelected = useCallback(async () => {
    if (storageAccess === false) { showStorageError('Permission denied'); return }
    const selected = files.filter((f) => selectedPaths.includes(filePathOf(f)))
    let count = 0
    for (const f of selected) {
      if (f.is_dir) continue
      const url = downloadUrlOf(f)
      if (url) { await enqueueOne(url, f.name); count++ }
    }
    exitMultiSelect()
    if (count > 0) Alert.alert('已加入下载队列', `${count} 个文件`)
  }, [storageAccess, files, selectedPaths, filePathOf, downloadUrlOf, enqueueOne, exitMultiSelect])

  const pushAria2 = useCallback((f: OpenListFile) => {
    const run = () => {
      setActionItem(null)
      void (async () => {
        const res = await pushToAria2([filePathOf(f)])
        if (res.ok) {
          const verify = res.verify && res.verify.bad > 0
            ? `\naria2 收到 ${res.verify.bad} 个错误任务：${res.verify.badMsg ?? '未知'}`
            : ''
          Alert.alert('已推送', `${f.name} 已加入 aria2${verify}`)
        } else Alert.alert('推送失败', res.error ?? '未知错误')
      })()
    }
    if (f.is_dir) {
      Alert.alert('推送文件夹', `将展开 "${f.name}" 内所有文件并逐个推送到 aria2（保留目录结构），继续？`, [
        { text: '取消', style: 'cancel' },
        { text: '继续', onPress: run },
      ])
    } else run()
  }, [filePathOf, pushToAria2])

  const pushAria2Selected = useCallback(() => {
    const selected = files.filter((f) => selectedPaths.includes(filePathOf(f)))
    const paths = selected.map((f) => filePathOf(f))
    if (!paths.length) { Alert.alert('提示', '请选择要推送的项目'); return }
    const run = () => {
      exitMultiSelect()
      void (async () => {
        const res = await pushToAria2(paths)
        if (res.ok) {
          const verify = res.verify && res.verify.bad > 0
            ? `\naria2 收到 ${res.verify.bad} 个错误任务：${res.verify.badMsg ?? '未知'}`
            : ''
          Alert.alert('已推送', `${res.count} 个文件已加入 aria2${verify}`)
        } else Alert.alert('推送失败', res.error ?? '未知错误')
      })()
    }
    if (selected.some((f) => f.is_dir)) {
      Alert.alert('推送文件夹', '所选内容包含文件夹，将展开为多个文件逐文件推送（保留目录结构），继续？', [
        { text: '取消', style: 'cancel' },
        { text: '继续', onPress: run },
      ])
    } else run()
  }, [files, selectedPaths, filePathOf, exitMultiSelect, pushToAria2])

  const confirmRemove = useCallback((f: OpenListFile) => {
    const name = f.name
    Alert.alert('删除', `确定要删除 "${name}" 吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => {
        void (async () => {
          const ok = await remove(path, [name])
          if (!ok) Alert.alert('删除失败', latestError() ?? '未知错误')
          setActionItem(null)
        })()
      } },
    ])
  }, [path, remove])

  const confirmRemoveSelected = useCallback(() => {
    if (!selectedPaths.length) return
    Alert.alert('确认删除', `确定删除选中的 ${selectedPaths.length} 项？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => {
        void (async () => {
          const names = files.filter((f) => selectedPaths.includes(filePathOf(f))).map((f) => f.name)
          const ok = await remove(path, names)
          if (!ok) Alert.alert('删除失败', latestError() ?? '未知错误')
        })()
      } },
    ])
  }, [selectedPaths, files, filePathOf, path, remove])

  const openEdit = useCallback((mode: Exclude<EditMode, null>, f?: OpenListFile) => {
    setEditTarget(f ?? null)
    setActionItem(null)
    if (mode === 'copy' || mode === 'move') {
      setPickerMode(mode)
      const exclude = (f?.is_dir && f?.name) ? joinOpenListPath(path, f.name) : undefined
      setPickerExclude(exclude)
      setPickerOpen(true)
      return
    }
    setEditText(mode === 'rename' && f ? f.name : '')
    setEditMode(mode)
  }, [path])

  const closePicker = useCallback(() => {
    setPickerOpen(false)
    setActionItem(null)
  }, [])

  const submitPicker = useCallback(async (dstPath: string) => {
    if (!editTarget) { setPickerOpen(false); return }
    const names = [editTarget.name]
    setEditBusy(true)
    const ok = pickerMode === 'move'
      ? await move(path, names, dstPath)
      : await copy(path, names, dstPath)
    setEditBusy(false)
    setPickerOpen(false)
    if (!ok) Alert.alert(pickerMode === 'move' ? '移动失败' : '复制失败', latestError() ?? '未知错误')
  }, [pickerMode, editTarget, path, move, copy])

  const submitEdit = useCallback(async () => {
    const val = editText.trim()
    if (!val) return
    if (editMode === 'rename') {
      if (!editTarget) return
      const ok = await rename(filePathOf(editTarget), val)
      if (ok) setEditMode(null)
      else Alert.alert('重命名失败', latestError() ?? '未知错误')
    }
  }, [editMode, editText, editTarget, filePathOf, rename])

  const openDetails = useCallback(async (f: OpenListFile) => {
    setActionItem(null)
    setDetailItem(f)
    setDetailLoading(true)
    setDetailInfo(null)
    try {
      const info = server ? await openListGet(server, filePathOf(f)) : null
      setDetailInfo(info)
    } catch {
      setDetailInfo(null)
    }
    setDetailLoading(false)
  }, [server, filePathOf])

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
    { key: 'downloader', label: '下载工具设置', icon: 'settings', onPress: () => { setDrawerOpen(false); setDlOpen(true) } },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ServiceHeader
        mode="filebrowser"
        t={t}
        title={server.name}
        onMenuPress={() => setDrawerOpen(true)}
        onRefresh={() => { void refresh() }}
      />

      <Breadcrumbs path={path} onJump={(p) => void cdByPath(p)} t={t} />

      <ToolbarRow
        multiSelect={multiSelect}
        selectedCount={selectedPaths.length}
        totalCount={files.length}
        atRoot={path === '/'}
        sortLabel={SORT_LABELS[sortBy]}
        sortDir={sortDir}
        onBack={() => { void up() }}
        onToggleMultiSelect={enterMultiSelect}
        onSelectAll={selectAll}
        onCancelSelect={exitMultiSelect}
        onOpenSort={() => setSortOpen(true)}
        onMkdir={() => setMkdirOpen(true)}
        onUpload={() => { void pickAndUpload() }}
        t={t}
      />

      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: (t.warning || '#f0a020') + '22' }]}>
          <Text style={{ color: t.warning || '#a06000' }}>{error}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: multiSelect ? 110 : 32 }}>
        {loading && files.length === 0 ? (
          <View style={styles.center}><ActivityIndicator size="large" color={t.primary} /></View>
        ) : files.length === 0 ? (
          <Text style={[styles.empty, { color: t.textMuted }]}>空目录</Text>
        ) : (
          sortedFiles.map((f) => {
            const fp = filePathOf(f)
            const selected = selectedPaths.includes(fp)
            return (
              <TouchableOpacity
                key={fp}
                activeOpacity={0.7}
                onPress={() => onItemPress(f)}
                onLongPress={() => onItemLongPress(f)}
                style={[styles.row, { backgroundColor: t.card, borderColor: selected ? t.primary : t.border }]}
              >
                {multiSelect ? (
                  <View style={[styles.checkbox, { borderColor: selected ? t.primary : t.textMuted }]}>
                    {selected ? <View style={[styles.checkboxInner, { backgroundColor: t.primary }]} /> : null}
                  </View>
                ) : null}
                <Icon name={f.is_dir ? 'folderContent' : fileIcon(f.name)} size={22} color={t.primary} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fileName, { color: t.text }]} numberOfLines={1}>{f.name}</Text>
                  {!f.is_dir ? <Text style={[styles.fileMeta, { color: t.textMuted }]}>{formatSize(f.size)}{f.modified ? `  ·  ${f.modified}` : ''}</Text> : null}
                </View>
                {f.is_dir ? <Icon name="chevronRight" size={18} /> : null}
              </TouchableOpacity>
            )
          })
        )}
      </ScrollView>

      {uploading ? (
        <View style={[styles.uploadingBar, { backgroundColor: t.card, borderTopColor: t.border }]}>
          <ActivityIndicator size="small" color={t.primary} />
          <Text style={[styles.uploadingText, { color: t.textMuted }]}>上传中...</Text>
        </View>
      ) : null}

      {multiSelect ? (
        <View style={[styles.bottomBar, { backgroundColor: t.card, borderTopColor: t.border, elevation: 12 }]}>
          <Text style={[styles.selectCount, { color: t.text }]}>已选 {selectedPaths.length}</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={styles.bottomAction} onPress={() => { void downloadSelected() }}>
            <Text style={[styles.bottomActionText, { color: t.primary }]}>下载</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomAction} onPress={() => { void pushAria2Selected() }}>
            <Text style={[styles.bottomActionText, { color: t.primary }]}>推 aria2</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomAction} onPress={confirmRemoveSelected}>
            <Text style={[styles.bottomActionText, { color: t.danger }]}>删除</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ServiceDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userInfo={{ name: server.name, url: server.url, avatar: server.name }}
        versionInfo={{ type: 'OpenList' }}
        items={drawerItems}
        t={t}
      />

      {/* 新建文件夹 */}
      <Modal visible={mkdirOpen} transparent animationType="slide" onRequestClose={() => setMkdirOpen(false)}>
        <KeyboardAvoidingView behavior="padding" style={styles.modalRoot}>
          <TouchableOpacity style={styles.backdrop} onPress={() => setMkdirOpen(false)} activeOpacity={1} />
          <View style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + 16 }]}>
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
        </KeyboardAvoidingView>
      </Modal>

      {/* 文件/文件夹操作 */}
      <Modal visible={!!actionItem} transparent animationType="slide" onRequestClose={() => setActionItem(null)}>
        <View style={styles.modalRoot}>
          <TouchableOpacity style={styles.backdrop} onPress={() => setActionItem(null)} activeOpacity={1} />
          <View style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + 16 }]}>
            <Text style={[styles.sheetTitle, { color: t.text }]} numberOfLines={1}>{actionItem?.name}</Text>
            {actionItem && !actionItem.is_dir && (
              <TouchableOpacity style={styles.menuRow} onPress={() => download(actionItem)}>
                <Icon name="downloadRounded" size={22} color={t.text} style={{ marginRight: 12 }} />
                <Text style={[styles.menuRowText, { color: t.text }]}>下载</Text>
              </TouchableOpacity>
            )}
            {actionItem && (
              <TouchableOpacity style={styles.menuRow} onPress={() => openEdit('rename', actionItem)}>
                <Icon name="fileDocument" size={22} color={t.text} style={{ marginRight: 12 }} />
                <Text style={[styles.menuRowText, { color: t.text }]}>重命名</Text>
              </TouchableOpacity>
            )}
            {actionItem && (
              <TouchableOpacity style={styles.menuRow} onPress={() => openEdit('copy', actionItem)}>
                <Icon name="file" size={22} color={t.text} style={{ marginRight: 12 }} />
                <Text style={[styles.menuRowText, { color: t.text }]}>复制到...</Text>
              </TouchableOpacity>
            )}
            {actionItem && (
              <TouchableOpacity style={styles.menuRow} onPress={() => openEdit('move', actionItem)}>
                <Icon name="folderContent" size={22} color={t.text} style={{ marginRight: 12 }} />
                <Text style={[styles.menuRowText, { color: t.text }]}>移动到...</Text>
              </TouchableOpacity>
            )}
            {actionItem && (
              <TouchableOpacity style={styles.menuRow} onPress={() => { void openDetails(actionItem) }}>
                <Icon name="alertCircle" size={22} color={t.text} style={{ marginRight: 12 }} />
                <Text style={[styles.menuRowText, { color: t.text }]}>详细信息</Text>
              </TouchableOpacity>
            )}
            {actionItem && (
              <TouchableOpacity style={styles.menuRow} onPress={() => pushAria2(actionItem)}>
                <Icon name="downloadCloud" size={22} style={{ marginRight: 12 }} />
                <Text style={[styles.menuRowText, { color: t.text }]}>推送到 aria2 下载</Text>
              </TouchableOpacity>
            )}
            {actionItem && (
              <TouchableOpacity style={styles.menuRow} onPress={() => confirmRemove(actionItem)}>
                <Icon name="x" size={22} color={t.danger} style={{ marginRight: 12 }} />
                <Text style={[styles.menuRowText, { color: t.danger }]}>删除</Text>
              </TouchableOpacity>
            )}
            <View style={styles.sheetActions}>
              <TouchableOpacity onPress={() => setActionItem(null)}><Text style={[styles.actionText, { color: t.primary }]}>取消</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 重命名 / 移动 / 复制 */}
      <Modal visible={!!editMode} transparent animationType="slide" onRequestClose={() => setEditMode(null)}>
        <KeyboardAvoidingView behavior="padding" style={styles.modalRoot}>
          <TouchableOpacity style={styles.backdrop} onPress={() => setEditMode(null)} activeOpacity={1} />
          <View style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + 16 }]}>
            <Text style={[styles.sheetTitle, { color: t.text }]}>{'重命名'}</Text>
            <TextInput
              autoFocus
              style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
              value={editText}
              onChangeText={setEditText}
              placeholder={'新名称'}
              placeholderTextColor={t.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity onPress={() => setEditMode(null)}><Text style={[styles.actionText, { color: t.textMuted }]}>取消</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { void submitEdit() }} disabled={editBusy}>
                <Text style={[styles.actionText, { color: t.primary }]}>{editBusy ? '处理中...' : '确定'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <FolderPickerModal
        visible={pickerOpen}
        title={pickerMode === 'copy' ? '复制到' : '移动到'}
        initialPath="/"
        excludePathPrefix={pickerExclude}
        listFolders={async (targetPath: string) => {
          if (!server) return { ok: false, error: '未配置 OpenList' }
          try {
            const list = await openListList(server, targetPath)
            return { ok: true, folders: list.filter((f) => f.is_dir).map((f) => f.name) }
          } catch (e: any) {
            return { ok: false, error: e?.message ?? '加载失败' }
          }
        }}
        createFolder={async (parentPath: string, name: string) => {
          if (!server) return { ok: false, error: '未配置 OpenList' }
          try {
            await openListMkdir(server, parentPath.endsWith('/') ? `${parentPath}${name}` : `${parentPath}/${name}`)
            return { ok: true }
          } catch (e: any) {
            return { ok: false, error: e?.message ?? '新建失败' }
          }
        }}
        onConfirm={submitPicker}
        onClose={closePicker}
      />

      {/* 详细信息 */}
      <Modal visible={!!detailItem} transparent animationType="slide" onRequestClose={() => setDetailItem(null)}>
        <View style={styles.modalRoot}>
          <TouchableOpacity style={styles.backdrop} onPress={() => setDetailItem(null)} activeOpacity={1} />
          <View style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + 16 }]}>
            <Text style={[styles.sheetTitle, { color: t.text }]} numberOfLines={1}>{detailItem?.name}</Text>
            {detailLoading ? (
              <View style={styles.center}><ActivityIndicator color={t.primary} /></View>
            ) : (
              <View>
                <DetailRow label="类型" value={detailInfo?.is_dir ? '文件夹' : '文件'} t={t} />
                <DetailRow label="路径" value={detailItem ? filePathOf(detailItem) : ''} t={t} />
                <DetailRow label="大小" value={detailInfo ? formatSize(detailInfo.size) : formatSize(detailItem?.size ?? 0)} t={t} />
                <DetailRow label="修改时间" value={detailInfo?.modified ?? detailItem?.modified ?? '-'} t={t} />
              </View>
            )}
            <View style={styles.sheetActions}>
              <TouchableOpacity onPress={() => setDetailItem(null)}><Text style={[styles.actionText, { color: t.primary }]}>关闭</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 排序 */}
      <Modal visible={sortOpen} transparent animationType="slide" onRequestClose={() => setSortOpen(false)}>
        <View style={styles.modalRoot}>
          <TouchableOpacity style={styles.backdrop} onPress={() => setSortOpen(false)} activeOpacity={1} />
          <View style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + 16 }]}>
            <Text style={[styles.sheetTitle, { color: t.text }]}>排序方式</Text>
            {(['name', 'size', 'modified'] as OpenListSortBy[]).map((by) => (
              <TouchableOpacity key={by} style={styles.sortOption} onPress={() => setSortBy(by)}>
                <Text style={[styles.sortOptionText, { color: t.text }]}>{SORT_LABELS[by]}</Text>
                {sortBy === by ? <Text style={[styles.sortOptionMark, { color: t.primary }]}>●</Text> : <View style={styles.sortOptionMarkSpacer} />}
              </TouchableOpacity>
            ))}
            <Text style={[styles.sheetTitle, { color: t.text, marginTop: 12 }]}>顺序</Text>
            {(['asc', 'desc'] as const).map((d) => (
              <TouchableOpacity key={d} style={styles.sortOption} onPress={() => setSortDir(d)}>
                <Text style={[styles.sortOptionText, { color: t.text }]}>{d === 'asc' ? '升序 ↑' : '降序 ↓'}</Text>
                {sortDir === d ? <Text style={[styles.sortOptionMark, { color: t.primary }]}>●</Text> : <View style={styles.sortOptionMarkSpacer} />}
              </TouchableOpacity>
            ))}
            <View style={styles.sheetActions}>
              <TouchableOpacity onPress={() => setSortOpen(false)}><Text style={[styles.actionText, { color: t.primary }]}>关闭</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 下载工具（aria2）设置 */}
      <Modal visible={dlOpen} transparent animationType="slide" onRequestClose={() => setDlOpen(false)}>
        <KeyboardAvoidingView behavior="padding" style={styles.modalRoot}>
          <TouchableOpacity style={styles.backdrop} onPress={() => setDlOpen(false)} activeOpacity={1} />
          <View style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + 16 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={[styles.sheetTitle, { color: t.text }]}>下载工具设置</Text>
              <TouchableOpacity onPress={() => setDlOpen(false)} style={{ padding: 4 }}>
                <Icon name="x" size={20} color={t.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.dlHint, { color: t.textMuted }]}>配置后由 app 直连该 aria2 RPC 推送下载（文件夹会递归展开并保留目录结构）。</Text>

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
              <TouchableOpacity onPress={onDlTest} disabled={dlTesting}>
                <Text style={[styles.actionText, { color: t.text }]}>{dlTesting ? '测试中...' : '测试连接'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onDlSave}><Text style={[styles.actionText, { color: t.primary }]}>保存</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <OpenListPreviewModal
        visible={!!previewFile}
        file={previewFile}
        filePath={previewFile ? filePathOf(previewFile) : ''}
        server={server}
        onClose={() => setPreviewFile(null)}
        onDownload={() => { const f = previewFile; setPreviewFile(null); if (f) download(f) }}
        onReLogin={() => { setPreviewFile(null); void initWithService(service) }}
      />
    </View>
  )
}

function DetailRow({ label, value, t }: { label: string; value: string; t: any }) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: t.textMuted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: t.text }]} numberOfLines={2}>{value || '-'}</Text>
    </View>
  )
}

function Breadcrumbs({ path, onJump, t }: { path: string; onJump: (p: string) => void; t: any }) {
  const segs = path.split('/').filter(Boolean)
  const items: { label: string; full: string }[] = [{ label: '根目录', full: '/' }]
  let acc = ''
  for (const s of segs) { acc += '/' + s; items.push({ label: s, full: acc }) }
  return (
    <View style={[styles.breadcrumbBar, { backgroundColor: t.card, borderBottomColor: t.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 12 }}
      >
        {items.map((it, idx) => (
          <View key={idx} style={{ flexDirection: 'row', alignItems: 'center' }}>
            {idx > 0 ? <Text style={[styles.breadcrumbSep, { color: t.textMuted }]}>{' / '}</Text> : null}
            <TouchableOpacity onPress={() => onJump(it.full)}>
              <Text style={[styles.breadcrumbText, { color: idx === items.length - 1 ? t.text : t.primary }]} numberOfLines={1}>{it.label}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

function ToolbarRow(props: {
  multiSelect: boolean
  selectedCount: number
  totalCount: number
  atRoot: boolean
  sortLabel: string
  sortDir: 'asc' | 'desc'
  onBack: () => void
  onToggleMultiSelect: () => void
  onSelectAll: () => void
  onCancelSelect: () => void
  onOpenSort: () => void
  onMkdir: () => void
  onUpload: () => void
  t: any
}) {
  const { multiSelect, atRoot, t } = props
  if (multiSelect) {
    return (
      <View style={[styles.toolbar, { borderBottomColor: t.border }]}>
        <Text style={[styles.selectedCount, { color: t.text }]}>已选 {props.selectedCount}/{props.totalCount}</Text>
        <View style={styles.toolbarSpacer} />
        <TouchableOpacity style={styles.toolbarButton} onPress={props.onSelectAll}>
          <Text style={[styles.toolbarAction, { color: t.primary }]}>全选</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarButton} onPress={props.onCancelSelect}>
          <Text style={[styles.toolbarAction, { color: t.primary }]}>取消</Text>
        </TouchableOpacity>
      </View>
    )
  }
  return (
    <View style={[styles.toolbar, { borderBottomColor: t.border }]}>
      <TouchableOpacity style={styles.iconButton} onPress={atRoot ? undefined : props.onBack} disabled={atRoot}>
        <Icon name="back" size={22} color={atRoot ? t.textMuted : t.primary} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.iconButton} onPress={props.onToggleMultiSelect}>
        <Icon name="multiSelect" size={22} color={t.primary} />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.sortButton, { borderColor: t.border }]} onPress={props.onOpenSort}>
        <Text style={[styles.sortButtonText, { color: t.text }]}>{props.sortLabel}</Text>
        <Icon name="sortArrow" size={14} color={t.textMuted} style={{ marginLeft: 6, transform: [{ rotate: props.sortDir === 'asc' ? '180deg' : '0deg' }] }} />
      </TouchableOpacity>
      <View style={styles.toolbarSpacer} />
      <TouchableOpacity style={styles.iconButton} onPress={props.onMkdir}>
        <Icon name="folderNew" size={22} color={t.primary} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.iconButton} onPress={props.onUpload}>
        <Icon name="upload" size={22} color={t.primary} />
      </TouchableOpacity>
    </View>
  )
}

function Aria2ImportButton({ t, onImported }: { t: any; onImported: (url: string, secret: string) => void }) {
  const services = useAppStore((s) => s.services)
  const aria2 = services.find((s) => s.type === 'aria2')
  if (!aria2) return null
  const rpcUrl = (aria2.url || '').replace(/\/+$/, '')
  const secret = aria2.apiKey || aria2.password || ''
  return (
    <TouchableOpacity
      style={[styles.importBtn, { backgroundColor: (t.primary || '#2196f3') + '18', borderColor: t.primary || '#2196f3' }]}
      onPress={() => onImported(rpcUrl, secret)}
    >
      <Icon name="downloadRounded" size={16} color={t.primary || '#2196f3'} style={{ marginRight: 6 }} />
      <Text style={[styles.importBtnText, { color: t.primary || '#2196f3' }]}>一键导入 aria2 配置</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 4, textAlign: 'center' },

  errorBanner: { padding: 8, marginHorizontal: 12, marginTop: 8, borderRadius: 8 },

  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  fileName: { fontSize: 14, fontWeight: '500' },
  fileMeta: { fontSize: 11, marginTop: 2 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, marginRight: 10, justifyContent: 'center', alignItems: 'center' },
  checkboxInner: { width: 12, height: 12, borderRadius: 2 },

  empty: { textAlign: 'center', marginTop: 32, fontSize: 13 },

  selectCount: { fontSize: 14, fontWeight: '600' },

  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  bottomAction: { paddingHorizontal: 14, paddingVertical: 8 },
  bottomActionText: { fontSize: 15, fontWeight: '700' },

  uploadingBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  uploadingText: { fontSize: 13 },

  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 32 },
  sheetTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,128,0.2)' },
  menuRowText: { fontSize: 15, fontWeight: '500' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
  hint: { fontSize: 12, marginTop: 6 },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, paddingTop: 16 },
  actionText: { fontSize: 14, fontWeight: '600' },
  detailRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,128,0.2)' },
  detailLabel: { width: 70, fontSize: 13 },
  detailValue: { flex: 1, fontSize: 13, fontWeight: '500' },

  breadcrumbBar: { borderBottomWidth: StyleSheet.hairlineWidth, height: 44, justifyContent: 'center' },
  breadcrumbText: { fontSize: 13, fontWeight: '600' },
  breadcrumbSep: { fontSize: 13 },

  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  toolbarSpacer: { flex: 1 },
  toolbarButton: { minWidth: 56, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  toolbarAction: { fontSize: 14, fontWeight: '600' },
  iconButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  selectedCount: { fontSize: 14, fontWeight: '600' },
  sortButton: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingHorizontal: 10, height: 34 },
  sortButtonText: { fontSize: 13, fontWeight: '500' },
  sortOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,128,0.2)' },
  sortOptionText: { fontSize: 15, fontWeight: '500' },
  sortOptionMark: { fontSize: 14 },
  sortOptionMarkSpacer: { width: 14 },

  dlHint: { fontSize: 12, marginBottom: 12 },
  dlLabel: { fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  importBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 8, paddingVertical: 9, marginTop: 4 },
  importBtnText: { fontSize: 13, fontWeight: '600' },
})
