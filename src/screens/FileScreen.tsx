import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Alert, Modal, Animated, BackHandler, AppState, StyleSheet, Platform, StatusBar } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { useAppStore, FileSortBy, FileSortDir } from '@/stores/appStore'
import { ServerConfig, FileItem, ServiceConfig, ShareInfo } from '@/types'
import { login, listFiles, searchFilesStream, createFolder, deleteResource, renameResource, copyResource, uploadResource, getShares, createShare, deleteShare } from '@/lib/api/filebrowser'
import { getFileIcon } from '@/lib/fileTypes'
import * as Clipboard from 'expo-clipboard'
import { useTheme } from '@/lib/theme'
import { sortFiles } from '@/lib/sort'
import ServiceBar from '@/components/ServiceBar'
import ServiceCard from '@/components/ServiceCard'
import Icon from '@/components/Icon'
import { launchNativeApp } from '@/lib/android-intent'
import { buildUrl } from '@/lib/api/client'
import { checkStoragePermission, openAllFilesSettings, enqueueDownload, cancelDownload, removeDownload } from '@/lib/downloadManager'

type EditMode = 'folder' | 'rename' | 'copy' | 'move' | null
type ViewMode = 'list' | 'grid'

const SORT_BY_LABEL: Record<FileSortBy, string> = {
  name: '按名称',
  size: '按大小',
  modified: '按修改时间',
}
const sortLabel = (by: FileSortBy) => SORT_BY_LABEL[by] ?? '排序'
const encodeRemotePath = (path: string) => path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')

export default function FileScreen() {
  const servers = useAppStore((s) => s.servers)
  const fbServers = servers.filter((s) => s.type === 'filebrowser')
  const t = useTheme()

  const [selectedServer, setSelectedServer] = useState<ServerConfig | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [files, setFiles] = useState<FileItem[]>([])
  const [currentPath, setCurrentPath] = useState('/')
  
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [isSearchResults, setIsSearchResults] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeService, setActiveService] = useState<ServiceConfig | null>(null)
  const [actionItem, setActionItem] = useState<FileItem | null>(null)
  const [editMode, setEditMode] = useState<EditMode>(null)
  const [editText, setEditText] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [multiSelect, setMultiSelect] = useState(false)
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [sortOpen, setSortOpen] = useState(false)
  const [shareManageOpen, setShareManageOpen] = useState(false)
  const [shareCreateItem, setShareCreateItem] = useState<FileItem | null>(null)
  const [shares, setShares] = useState<ShareInfo[]>([])
  const [shareLoading, setShareLoading] = useState(false)
  const [shareCreatePassword, setShareCreatePassword] = useState('')
  const [shareCreateExpiry, setShareCreateExpiry] = useState<number>(0)
  const [shareCreating, setShareCreating] = useState(false)
  const fileSort = useAppStore((s) => s.fileSort)
  const setFileSort = useAppStore((s) => s.setFileSort)
  const downloadTasks = useAppStore((s) => s.downloads)
  const addDownload = useAppStore((s) => s.addDownload)
  const removeDownloadTask = useAppStore((s) => s.removeDownload)
  const lastBackPressRef = useRef(0)
  const toastAnim = useRef(new Animated.Value(0)).current
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [toastMsg, setToastMsg] = useState('再按一次退出')

  const [storageAccess, setStorageAccess] = useState<boolean | null>(null)
  const [downloadManageOpen, setDownloadManageOpen] = useState(false)

  const SEARCH_CATEGORIES = [
    { label: '所有类型', value: 'all' },
    { label: '文件夹', value: 'folder' },
    { label: '文件', value: 'file' },
    { label: '图片', value: 'image' },
    { label: '视频', value: 'video' },
    { label: '音频', value: 'audio' },
    { label: '文档', value: 'doc' },
    { label: '压缩包', value: 'archive' },
  ] as const
  type SearchCategory = (typeof SEARCH_CATEGORIES)[number]['value']

  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchCategory, setSearchCategory] = useState<SearchCategory>('all')
  const [searchCategoryOpen, setSearchCategoryOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<FileItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchAbortRef = useRef<AbortController | null>(null)
  const searchGenerationRef = useRef(0)
  const searchResultsBufferRef = useRef<FileItem[]>([])
  const searchFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushSearchResultsBuffer = useCallback(() => {
    const gen = searchGenerationRef.current
    if (gen === 0) return
    if (searchFlushTimerRef.current) { clearTimeout(searchFlushTimerRef.current); searchFlushTimerRef.current = null }
    if (searchResultsBufferRef.current.length === 0) return
    if (gen !== searchGenerationRef.current) return
    setSearchResults((prev) => {
      if (searchGenerationRef.current !== gen) return prev
      const combined = [...prev, ...searchResultsBufferRef.current]
      searchResultsBufferRef.current = []
      return combined
    })
  }, [])

  const scheduleSearchFlush = useCallback(() => {
    if (searchFlushTimerRef.current) return
    searchFlushTimerRef.current = setTimeout(() => {
      searchFlushTimerRef.current = null
      flushSearchResultsBuffer()
    }, 100)
  }, [flushSearchResultsBuffer])
  

  const checkStorage = useCallback(async () => {
    const ok = await checkStoragePermission()
    setStorageAccess(ok)
  }, [])

  useEffect(() => { checkStorage() }, [checkStorage])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: string) => {
      if (state === 'active') checkStorage()
    })
    return () => sub.remove()
  }, [checkStorage])

  const showToast = (msg?: string) => {
    if (msg) setToastMsg(msg)
    Animated.timing(toastAnim, { toValue: 1, duration: 160, useNativeDriver: true }).start()
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start()
    }, 1500)
  }

  const handleTopServicePress = (service: ServiceConfig) => {
    if (service.type === 'immich') launchNativeApp(service.type, service.url)
    else setActiveService(service)
  }

  const connect = useCallback(async (server: ServerConfig) => {
    setLoading(true); setError(null)
    const result = await login(server)
    if (result.ok) { setToken(result.data); setSelectedServer(server) }
    else setError(result.error ?? '登录失败')
    setLoading(false)
  }, [])

  const loadDir = useCallback(async (path: string) => {
    if (!selectedServer || !token) return
    setLoading(true); setError(null); setIsSearchResults(false)
    const result = await listFiles(selectedServer, token, path)
    if (result.ok) { setFiles(sortFiles(result.data, fileSort)); setCurrentPath(path) }
    else setError(result.error ?? '加载失败')
    setLoading(false)
  }, [selectedServer, token, fileSort])

  const doSearch = useCallback(async (query: string, category: SearchCategory) => {
    if (!selectedServer || !token || !query.trim()) return
    const gen = ++searchGenerationRef.current
    searchAbortRef.current?.abort()
    if (searchFlushTimerRef.current) { clearTimeout(searchFlushTimerRef.current); searchFlushTimerRef.current = null }
    searchResultsBufferRef.current = []
    const controller = new AbortController()
    searchAbortRef.current = controller
    setSearchResults([])
    setSearchLoading(true); setSearchError(null)
    try {
      const typeSuffix = category === 'all' ? '' : ` type:${category}`
      const result = await searchFilesStream(
        selectedServer, token, query.trim() + typeSuffix, currentPath, controller.signal,
        (item) => {
          if (searchGenerationRef.current !== gen) return
          searchResultsBufferRef.current.push(item)
          if (searchResultsBufferRef.current.length >= 20) {
            flushSearchResultsBuffer()
          } else {
            scheduleSearchFlush()
          }
        }
      )
      if (searchGenerationRef.current !== gen) return
      flushSearchResultsBuffer()
      if (!result.ok) {
        if (result.error !== 'Cancelled') setSearchError(result.error ?? '搜索失败')
      }
    } catch (e: any) {
      if (searchGenerationRef.current !== gen) return
      if (e.name !== 'AbortError') setSearchError(e.message ?? '搜索失败')
    } finally {
      if (searchGenerationRef.current !== gen) return
      setSearchLoading(false)
      searchAbortRef.current = null
    }
  }, [selectedServer, token, currentPath, flushSearchResultsBuffer, scheduleSearchFlush])

  const stopSearch = useCallback(() => {
    ++searchGenerationRef.current
    searchAbortRef.current?.abort()
    if (searchFlushTimerRef.current) { clearTimeout(searchFlushTimerRef.current); searchFlushTimerRef.current = null }
    searchResultsBufferRef.current = []
    setSearchLoading(false)
  }, [])

  useEffect(() => {
    if (!searchModalOpen) {
      if (searchFlushTimerRef.current) { clearTimeout(searchFlushTimerRef.current); searchFlushTimerRef.current = null }
      searchResultsBufferRef.current = []
      setSearchLoading(false)
    }
  }, [searchModalOpen])

  const autoLoaded = useRef(false)
  useEffect(() => {
    if (fbServers.length === 1 && !selectedServer && !token) connect(fbServers[0])
  }, [fbServers, selectedServer, token, connect])
  useEffect(() => {
    if (selectedServer && token && !autoLoaded.current) {
      autoLoaded.current = true
      loadDir('/')
    }
  }, [selectedServer, token, loadDir])

  useEffect(() => {
    setFiles((prev) => sortFiles(prev, fileSort))
  }, [fileSort])

  const isAtRoot = currentPath === '/' || isSearchResults

  const parentPath = () => {
    if (isAtRoot) return
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    loadDir(parts.length ? `/${parts.join('/')}` : '/')
  }

  useEffect(() => {
    const onBack = () => {
      if (shareManageOpen) { setShareManageOpen(false); return true }
      if (shareCreateItem) { setShareCreateItem(null); return true }
      if (activeService) { setActiveService(null); return true }
      if (actionItem) { setActionItem(null); return true }
      if (editMode) { setEditMode(null); return true }
      if (multiSelect) { cancelSelection(); return true }
      if (!isAtRoot) { parentPath(); return true }
      const now = Date.now()
      if (now - lastBackPressRef.current < 2000) {
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastAnim.setValue(0)
        return false
      }
      lastBackPressRef.current = now
      showToast()
      return true
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBack)
    return () => subscription.remove()
  }, [activeService, actionItem, editMode, multiSelect, isAtRoot, currentPath, shareManageOpen, shareCreateItem])

  const remotePath = (name: string) => currentPath === '/' ? `/${name}` : `${currentPath.replace(/\/$/, '')}/${name}`

  const openEdit = (mode: EditMode, item?: FileItem) => {
    setActionItem(null)
    if (item) setSelectedPaths([item.path])
    setEditMode(mode)
    setEditText(mode === 'folder' ? '' : item?.name ?? '')
  }

  const toggleSelection = (item: FileItem) => {
    setSelectedPaths((paths) => paths.includes(item.path) ? paths.filter((path) => path !== item.path) : [...paths, item.path])
  }

  const selectedItems = () => files.filter((item) => selectedPaths.includes(item.path))

  const cancelSelection = () => {
    setSelectedPaths([])
    setMultiSelect(false)
  }

  const selectAll = () => {
    setSelectedPaths(files.map((f) => f.path))
  }

  const onListItemTap = (item: FileItem) => {
    if (multiSelect) { toggleSelection(item); return }
    if (item.isDirectory) loadDir(item.path)
    else setActionItem(item)
  }

  const onListItemLongPress = (item: FileItem) => {
    if (multiSelect) { toggleSelection(item); return }
    setActionItem(item)
  }

  const onGridItemTap = (item: FileItem) => {
    if (multiSelect) { toggleSelection(item); return }
    if (item.isDirectory) loadDir(item.path)
    else setActionItem(item)
  }

  const onGridItemLongPress = (item: FileItem) => {
    if (!selectedPaths.length) {
      setMultiSelect(true)
      setSelectedPaths([item.path])
      setActionItem(item)
      return
    }
    toggleSelection(item)
  }

  const onGridCheckboxTap = (item: FileItem) => {
    if (!multiSelect) setMultiSelect(true)
    toggleSelection(item)
  }

  const closeActionSheet = () => {
    setActionItem(null)
    if (multiSelect && selectedPaths.length <= 1) cancelSelection()
  }

  const submitEdit = async () => {
    if (!selectedServer || !token || !editMode || !editText.trim()) return
    setActionLoading(true)
    let result: { ok: boolean; error?: string }
    if (editMode === 'folder') result = await createFolder(selectedServer, token, remotePath(editText.trim()))
    else if (editMode === 'rename') {
      const target = selectedItems()[0]
      if (!target) result = { ok: false, error: '未选择文件' }
      else {
        const parent = target.path.split('/').filter(Boolean).slice(0, -1).join('/')
        result = await renameResource(selectedServer, token, target.path, `/${parent ? `${parent}/` : ''}${editText.trim()}`)
      }
    } else {
      const targets = selectedItems()
      if (!targets.length) result = { ok: false, error: '未选择文件' }
      else {
        const results = await Promise.all(targets.map((target) => editMode === 'copy'
          ? copyResource(selectedServer!, token!, target.path, editText.trim())
          : renameResource(selectedServer!, token!, target.path, editText.trim())))
        result = results.find((item) => !item.ok) ?? { ok: true }
      }
    }
    setActionLoading(false)
    if (!result.ok) Alert.alert('操作失败', result.error ?? '未知错误')
    else { setEditMode(null); cancelSelection(); loadDir(currentPath) }
  }

  const upload = async () => {
    if (!selectedServer || !token) return
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
    const asset = picked.assets?.[0]
    if (!asset) return
    setLoading(true)
    const result = await uploadResource(selectedServer, token, asset.uri, remotePath(asset.name))
    if (!result.ok) Alert.alert('上传失败', result.error ?? 'Upload failed')
    else await loadDir(currentPath)
    setLoading(false)
  }

  const doDownload = async (url: string, fileName: string) => {
    try {
      const task = await enqueueDownload(url, fileName, token!)
      addDownload(task)
      showToast('已加入下载队列')
    } catch (e: any) {
      showStorageError(e.message ?? '')
    }
  }

  const download = (item: FileItem) => {
    if (!selectedServer || !token) return
    if (!storageAccess) { showPermissionDialog(); return }
    closeActionSheet()
    const url = `${buildUrl(selectedServer.protocol, selectedServer.host, selectedServer.port)}/api/raw/${encodeRemotePath(item.path)}`
    doDownload(url, item.name)
  }

  const showPermissionDialog = () => {
    Alert.alert(
      '需要文件访问权限',
      '下载文件需要「所有文件访问权限」。请在系统设置中开启。',
      [
        { text: '取消', style: 'cancel' },
        { text: '去设置', onPress: () => { openAllFilesSettings() } },
      ],
    )
  }

  const showStorageError = (msg: string) => {
    if (msg.includes('Permission') || msg.includes('EACCES') || msg.includes('access')) {
      showPermissionDialog()
    } else {
      Alert.alert('下载失败', msg)
    }
  }

  const bulkDownload = async () => {
    if (!selectedServer || !token) return
    if (!storageAccess) { showPermissionDialog(); return }
    const selFiles = selectedItems().filter((item) => !item.isDirectory)
    const selDirs = selectedItems().filter((item) => item.isDirectory)
    const base = buildUrl(selectedServer.protocol, selectedServer.host, selectedServer.port)
    Alert.alert('下载方式', selFiles.length > 0 ? `文件 ${selFiles.length} 个${selDirs.length > 0 ? `, 文件夹 ${selDirs.length} 个` : ''}` : `文件夹 ${selDirs.length} 个`, [
      { text: '取消', style: 'cancel' },
      { text: '打包下载 (ZIP)', onPress: async () => {
        const name = currentPath.split('/').filter(Boolean).pop() || 'download'
        const url = `${base}/api/raw/${encodeRemotePath(currentPath)}?format=zip`
        await doDownload(url, `${name}.zip`)
        cancelSelection()
      } },
      ...(selFiles.length > 0 ? [{ text: '逐个下载', onPress: async () => {
        for (const item of selFiles) {
          const url = `${base}/api/raw/${encodeRemotePath(item.path)}`
          await doDownload(url, item.name)
        }
        cancelSelection()
      } }] : []),
    ])
  }

  const confirmRemove = (paths: string[]) => {
    if (!selectedServer || !token) return
    const label = paths.length > 1 ? `选中的 ${paths.length} 项` : (paths[0]?.split('/').pop() ?? '')
    Alert.alert('确认删除', `确定删除 ${label}？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        setLoading(true)
        const results = await Promise.all(paths.map((path) => deleteResource(selectedServer!, token!, path)))
        const failed = results.find((item) => !item.ok)
        if (failed) Alert.alert('删除失败', failed.error ?? 'Delete failed')
        cancelSelection(); await loadDir(currentPath); setLoading(false)
      } },
    ])
  }

  const loadShares = async () => {
    if (!selectedServer || !token) return
    setShareLoading(true)
    const result = await getShares(selectedServer, token)
    if (result.ok) setShares(result.data)
    setShareLoading(false)
  }

  const handleCreateShare = async () => {
    if (!selectedServer || !token || !shareCreateItem) return
    setShareCreating(true)
    const result = await createShare(selectedServer, token, shareCreateItem.path, shareCreatePassword || undefined, shareCreateExpiry || undefined)
    setShareCreating(false)
    if (!result.ok) { Alert.alert('创建分享失败', result.error); return }
    const link = `${buildUrl(selectedServer.protocol, selectedServer.host, selectedServer.port)}/share/${result.data.hash}`
    try { await Clipboard.setStringAsync(link) } catch {}
    setShareCreateItem(null)
    showToast('链接已复制')
  }

  const renderListItem = ({ item }: { item: FileItem }) => {
    const selected = selectedPaths.includes(item.path)
    return (
      <TouchableOpacity activeOpacity={0.7} style={[styles.fileItem, { borderBottomColor: t.border }, selected && { backgroundColor: t.primary + '22' }]} onPress={() => onListItemTap(item)} onLongPress={() => onListItemLongPress(item)}>
        {multiSelect && (
          <View style={[styles.checkboxWrap, { borderColor: selected ? t.primary : t.textMuted }]}>
            {selected && <View style={[styles.checkboxInner, { backgroundColor: t.primary }]} />}
          </View>
        )}
        <Icon name={item.isDirectory ? 'folderContent' : getFileIcon(item.name)} size={26} color={t.primary} />
        <View style={styles.fileInfo}>
          <Text style={[styles.fileName, { color: t.text }]} numberOfLines={1}>{item.name}</Text>
          {!item.isDirectory && <Text style={[styles.fileSize, { color: t.textMuted }]}>{(item.size / 1024).toFixed(1)} KB</Text>}
        </View>
        {!multiSelect && (
          <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.moreButton} onPress={() => setActionItem(item)}>
            <View style={[styles.moreDot, { backgroundColor: t.textMuted }]} />
            <View style={[styles.moreDot, { backgroundColor: t.textMuted }]} />
            <View style={[styles.moreDot, { backgroundColor: t.textMuted }]} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    )
  }

  const renderGridItem = ({ item }: { item: FileItem }) => {
    const selected = selectedPaths.includes(item.path)
    return (
      <TouchableOpacity activeOpacity={0.7} style={[styles.gridFileItem, { backgroundColor: t.card, borderColor: selected ? t.primary : t.border }]} onPress={() => onGridItemTap(item)} onLongPress={() => onGridItemLongPress(item)}>
        <Icon name={item.isDirectory ? 'folderContent' : getFileIcon(item.name)} size={32} color={t.primary} />
        <Text style={[styles.fileName, { color: t.text }]} numberOfLines={2}>{item.name}</Text>
        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.gridCheckbox} onPress={() => onGridCheckboxTap(item)}>
          <View style={[styles.checkboxWrap, { borderColor: selected ? t.primary : t.textMuted }]}>
            {selected && <View style={[styles.checkboxInner, { backgroundColor: t.primary }]} />}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    )
  }

  if (fbServers.length === 0) return <View style={[styles.container, styles.withServiceBar, { backgroundColor: t.bg }]}><ServiceBar onServicePress={handleTopServicePress} /><View style={styles.center}><Icon name="filebrowser" size={56} /><Text style={[styles.emptyTitle, { color: t.text }]}>尚未配置 FileBrowser</Text><Text style={[styles.emptySub, { color: t.textMuted }]}>到设置 → 服务器添加</Text></View></View>

  const hasSelection = selectedPaths.length > 0
  const showBottomBar = multiSelect && hasSelection

  return (
    <View style={[styles.container, styles.withServiceBar, { backgroundColor: t.bg }]}>
      <ServiceBar onServicePress={handleTopServicePress} />
      <View style={[styles.header, { backgroundColor: t.headerBg, borderBottomColor: t.border }]}>
        <TouchableOpacity style={styles.headerButton} onPress={parentPath} disabled={isAtRoot}>
          <Icon name="back" size={22} color={isAtRoot ? t.textMuted : t.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerButton} onPress={() => selectedServer && loadDir('/')}>
          <Icon name="home" size={22} color={t.primary} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={[styles.headerTitleText, { color: t.text }]} numberOfLines={1}>{isSearchResults ? '搜索结果' : (currentPath === '/' ? '文件管理' : '文件')}</Text>
        </View>
        <TouchableOpacity style={styles.headerButton} onPress={() => { loadShares(); setShareManageOpen(true) }}>
          <Icon name="shareManage" size={22} color={t.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerButton} onPress={() => { setSearchQuery(''); setSearchError(null); setSearchCategory('all'); setSearchModalOpen(true) }}>
          <Icon name="search" size={22} color={t.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerButton} onPress={() => selectedServer && loadDir(currentPath)}>
          <Icon name="refresh" size={22} color={t.primary} />
        </TouchableOpacity>
      </View>
      
      {!isSearchResults && (
        <View style={[styles.pathRow, { borderBottomColor: t.border }]}>
          <Text style={[styles.pathLabel, { color: t.textMuted }]} numberOfLines={1}>{currentPath}</Text>
        </View>
      )}
      {!isSearchResults && (
        <View style={[styles.toolbar, { borderBottomColor: t.border }]}>
          {multiSelect ? (
            <>
              <Text style={[styles.selectedCount, { color: t.text }]}>已选 {selectedPaths.length}/{files.length}</Text>
              <View style={styles.toolbarSpacer} />
              <TouchableOpacity style={styles.toolbarButton} onPress={selectAll}>
                <Text style={[styles.toolbarAction, { color: t.primary }]}>全选</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolbarButton} onPress={cancelSelection}>
                <Text style={[styles.toolbarAction, { color: t.primary }]}>取消</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.iconButton} onPress={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}>
                <Icon name={viewMode === 'list' ? 'viewGrid' : 'viewList'} size={22} color={t.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={() => { setMultiSelect(true) }}>
                <Icon name="multiSelect" size={22} color={t.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sortButton, { borderColor: t.border }]} onPress={() => setSortOpen(true)}>
                <Text style={[styles.sortButtonText, { color: t.text }]}>{sortLabel(fileSort.by)}</Text>
                <Icon name="sortArrow" size={14} color={t.textMuted} style={{ marginLeft: 6, transform: [{ rotate: fileSort.dir === 'asc' ? '180deg' : '0deg' }] }} />
              </TouchableOpacity>
              <View style={styles.toolbarSpacer} />
              <TouchableOpacity style={styles.iconButton} onPress={() => openEdit('folder')}>
                <Icon name="folderNew" size={22} color={t.primary} />
              </TouchableOpacity>
              {downloadTasks.filter((t) => t.progress.status !== 'successful' && t.progress.status !== 'failed').length > 0 && (
                <TouchableOpacity style={styles.iconButton} onPress={() => setDownloadManageOpen(true)}>
                  <Icon name="downloadRounded" size={22} color={t.primary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.iconButton} onPress={upload}>
                <Icon name="upload" size={22} color={t.primary} />
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
      {storageAccess === false && (
        <TouchableOpacity style={[styles.storageBanner, { backgroundColor: t.warning + '22', borderBottomColor: t.warning }]} onPress={showPermissionDialog}>
          <Text style={[styles.storageBannerText, { color: t.warning }]}>需要授权才能下载到 Download/One NAS，点击去设置</Text>
        </TouchableOpacity>
      )}
      {error && !loading && <Text style={[styles.errorText, { color: t.danger }]}>{error}</Text>}
      {loading && (
        <View style={styles.spinnerOverlay}>
          <ActivityIndicator size="large" color={t.primary} />
        </View>
      )}
      <FlatList
        style={styles.list}
        contentContainerStyle={[styles.listContent, showBottomBar && styles.listContentWithBar]}
        key={`${viewMode}-${currentPath}`}
        data={files}
        numColumns={viewMode === 'grid' ? 2 : 1}
        keyExtractor={(item, index) => `${item.path}-${index}`}
        renderItem={viewMode === 'list' ? renderListItem : renderGridItem}
        columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
        ListEmptyComponent={!loading ? <View style={styles.center}><Text style={[styles.emptySub, { color: t.textMuted }]}>空文件夹</Text></View> : null}
      />

      {showBottomBar && (
        <View style={[styles.bottomBar, { backgroundColor: t.card, borderTopColor: t.border, elevation: 12 }]}>
          <Text style={[styles.selectedCount, { color: t.text }]}>已选 {selectedPaths.length}</Text>
          <TouchableOpacity style={styles.bottomAction} onPress={bulkDownload}>
            <Text style={[styles.bottomActionText, { color: t.primary }]}>下载</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomAction} onPress={() => openEdit('copy')}>
            <Text style={[styles.bottomActionText, { color: t.primary }]}>复制</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomAction} onPress={() => openEdit('move')}>
            <Text style={[styles.bottomActionText, { color: t.primary }]}>移动</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomAction} onPress={() => confirmRemove(selectedPaths)}>
            <Text style={[styles.bottomActionText, { color: t.danger }]}>删除</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={!!actionItem} transparent animationType="slide" onRequestClose={closeActionSheet}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={closeActionSheet} activeOpacity={1} />
          <View style={[styles.actionSheet, { backgroundColor: t.card }]}>
            <Text style={[styles.actionTitle, { color: t.text }]} numberOfLines={1}>{actionItem?.name}</Text>
            {actionItem && !actionItem.isDirectory && (
              <TouchableOpacity style={styles.actionButton} onPress={() => download(actionItem)}>
                <Text style={[styles.actionText, { color: t.text }]}>下载</Text>
              </TouchableOpacity>
            )}
            {actionItem && actionItem.isDirectory && (
              <TouchableOpacity style={styles.actionButton} onPress={() => { if (!storageAccess) { showPermissionDialog(); return }; const item = actionItem; closeActionSheet(); const url = `${buildUrl(selectedServer!.protocol, selectedServer!.host, selectedServer!.port)}/api/raw/${encodeRemotePath(item.path)}?format=zip`; doDownload(url, `${item.name}.zip`) }}>
                <Text style={[styles.actionText, { color: t.text }]}>打包下载</Text>
              </TouchableOpacity>
            )}
            {actionItem && (
              <TouchableOpacity style={styles.actionButton} onPress={() => { const item = actionItem; closeActionSheet(); setShareCreateItem(item); setShareCreatePassword(''); setShareCreateExpiry(0); }}>
                <Text style={[styles.actionText, { color: t.text }]}>分享</Text>
              </TouchableOpacity>
            )}
            {actionItem && (
              <TouchableOpacity style={styles.actionButton} onPress={() => openEdit('rename', actionItem)}>
                <Text style={[styles.actionText, { color: t.text }]}>重命名</Text>
              </TouchableOpacity>
            )}
            {actionItem && (
              <TouchableOpacity style={styles.actionButton} onPress={() => openEdit('copy', actionItem)}>
                <Text style={[styles.actionText, { color: t.text }]}>复制到...</Text>
              </TouchableOpacity>
            )}
            {actionItem && (
              <TouchableOpacity style={styles.actionButton} onPress={() => openEdit('move', actionItem)}>
                <Text style={[styles.actionText, { color: t.text }]}>移动到...</Text>
              </TouchableOpacity>
            )}
            {actionItem && (
              <TouchableOpacity style={styles.actionButton} onPress={() => { const target = actionItem; closeActionSheet(); confirmRemove([target.path]) }}>
                <Text style={[styles.actionText, { color: t.danger }]}>删除</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.actionButton} onPress={closeActionSheet}>
              <Text style={[styles.actionText, { color: t.primary, fontWeight: '700' }]}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={!!editMode} transparent animationType="slide" onRequestClose={() => setEditMode(null)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setEditMode(null)} activeOpacity={1} />
          <View style={[styles.editSheet, { backgroundColor: t.card }]}>
            <Text style={[styles.actionTitle, { color: t.text }]}>{editMode === 'folder' ? '新建文件夹' : editMode === 'rename' ? '重命名' : editMode === 'copy' ? '复制到' : '移动到'}</Text>
            <TextInput autoFocus style={[styles.editInput, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]} value={editText} onChangeText={setEditText} placeholder={editMode === 'folder' || editMode === 'rename' ? '名称' : '/目标路径'} placeholderTextColor={t.textMuted} />
            <View style={styles.editActions}><TouchableOpacity onPress={() => setEditMode(null)}><Text style={[styles.actionText, { color: t.textMuted }]}>取消</Text></TouchableOpacity><TouchableOpacity onPress={submitEdit} disabled={actionLoading}><Text style={[styles.actionText, { color: t.primary, fontWeight: '700' }]}>{actionLoading ? '处理中...' : '确定'}</Text></TouchableOpacity></View>
          </View>
        </View>
      </Modal>
      <Modal visible={!!activeService} animationType="slide" onRequestClose={() => setActiveService(null)}>
        <View style={[styles.container, { backgroundColor: t.bg, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0 }]}>
          <View style={[styles.modalHeader, { backgroundColor: t.headerBg, borderBottomColor: t.border }]}><Text style={[styles.modalTitle, { color: t.text }]}>{activeService?.name ?? ''}</Text><TouchableOpacity onPress={() => setActiveService(null)}><Text style={[styles.toolbarAction, { color: t.primary }]}>关闭</Text></TouchableOpacity></View>
          {activeService && <ServiceCard service={activeService} />}
        </View>
      </Modal>

      <Modal visible={!!shareCreateItem} animationType="slide" onRequestClose={() => setShareCreateItem(null)}>
        <View style={[styles.container, { backgroundColor: t.bg, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0 }]}>
          <View style={[styles.modalHeader, { backgroundColor: t.headerBg, borderBottomColor: t.border }]}>
            <Text style={[styles.modalTitle, { color: t.text }]}>创建分享</Text>
            <TouchableOpacity onPress={() => setShareCreateItem(null)}><Text style={[styles.toolbarAction, { color: t.primary }]}>关闭</Text></TouchableOpacity>
          </View>
          <View style={styles.shareCreateBody}>
            <Text style={[styles.sharePath, { color: t.text }]}>{shareCreateItem?.path}</Text>
            <View style={[styles.shareToggle, { backgroundColor: t.card }]}>
              <Text style={[styles.shareToggleLabel, { color: t.text }]}>启用分享</Text>
              <View style={[styles.shareToggleDot, { backgroundColor: t.success }]} />
            </View>
            <TextInput
              style={[styles.shareInput, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
              value={shareCreatePassword}
              onChangeText={setShareCreatePassword}
              placeholder="密码（可选）"
              placeholderTextColor={t.textMuted}
              secureTextEntry
            />
            <Text style={[styles.shareSectionTitle, { color: t.text }]}>有效期</Text>
            <View style={styles.shareExpiryRow}>
              {[
                { label: '不过期', value: 0 },
                { label: '7 天', value: 7 },
                { label: '30 天', value: 30 },
              ].map((opt) => (
                <TouchableOpacity key={opt.value} style={[styles.shareExpiryOption, { borderColor: shareCreateExpiry === opt.value ? t.primary : t.border }]} onPress={() => setShareCreateExpiry(opt.value)}>
                  <Text style={[styles.shareExpiryText, { color: shareCreateExpiry === opt.value ? t.primary : t.text }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.shareCreateBtn, { backgroundColor: t.primary }]} onPress={handleCreateShare} disabled={shareCreating}>
              <Text style={styles.shareCreateBtnText}>{shareCreating ? '创建中...' : '创建并复制链接'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={shareManageOpen} animationType="slide" onRequestClose={() => setShareManageOpen(false)}>
        <View style={[styles.container, { backgroundColor: t.bg, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0 }]}>
          <View style={[styles.modalHeader, { backgroundColor: t.headerBg, borderBottomColor: t.border }]}>
            <Text style={[styles.modalTitle, { color: t.text }]}>分享管理</Text>
            <TouchableOpacity onPress={() => setShareManageOpen(false)}><Text style={[styles.toolbarAction, { color: t.primary }]}>关闭</Text></TouchableOpacity>
          </View>
          {shareLoading ? (
            <ActivityIndicator style={{ margin: 12 }} />
          ) : shares.length === 0 ? (
            <View style={styles.center}><Text style={[styles.emptySub, { color: t.textMuted }]}>暂无分享</Text></View>
          ) : (
            <FlatList
              data={shares}
              keyExtractor={(item: ShareInfo) => item.hash}
              renderItem={({ item }) => {
                const link = `${buildUrl(selectedServer!.protocol, selectedServer!.host, selectedServer!.port)}/share/${item.hash}`
                return (
                  <View style={[styles.shareItem, { borderBottomColor: t.border }]}>
                    <Text style={[styles.shareItemPath, { color: t.text }]} numberOfLines={1}>{item.path}</Text>
                    <Text style={[styles.shareItemLink, { color: t.textMuted }]} numberOfLines={1}>{link}</Text>
                    <View style={styles.shareItemMeta}>
                      <Text style={[styles.shareItemDate, { color: t.textMuted }]}>
                        {item.expire > 0 ? `过期: ${new Date(item.expire * 1000).toLocaleDateString()}` : '永久有效'}
                      </Text>
                      {item.hasPassword && <Text style={[styles.shareItemBadge, { color: t.warning }]}>🔒 有密码</Text>}
                    </View>
                    <View style={styles.shareItemActions}>
                      <TouchableOpacity style={[styles.shareItemBtn, { borderColor: t.primary }]} onPress={async () => { try { await Clipboard.setStringAsync(link); showToast('链接已复制') } catch {} }}>
                        <Text style={[styles.shareItemBtnText, { color: t.primary }]}>复制链接</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.shareItemBtn, { borderColor: t.danger }]} onPress={async () => {
                        const result = await deleteShare(selectedServer!, token!, item.hash)
                        if (result.ok) loadShares()
                        else Alert.alert('删除失败', result.error)
                      }}>
                        <Text style={[styles.shareItemBtnText, { color: t.danger }]}>删除</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              }}
            />
          )}
        </View>
      </Modal>

      <Modal visible={sortOpen} transparent animationType="slide" onRequestClose={() => setSortOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setSortOpen(false)} activeOpacity={1} />
          <View style={[styles.sortSheet, { backgroundColor: t.card }]}>
            <Text style={[styles.sortSheetTitle, { color: t.text }]}>排序方式</Text>
            {(['name', 'size', 'modified'] as FileSortBy[]).map((by) => (
              <TouchableOpacity key={by} style={[styles.sortOption, { borderBottomColor: t.border }]} onPress={() => setFileSort({ by, dir: fileSort.dir })}>
                <Text style={[styles.sortOptionText, { color: t.text }]}>{SORT_BY_LABEL[by]}</Text>
                <Text style={[styles.sortOptionMark, { color: fileSort.by === by ? t.primary : 'transparent' }]}>●</Text>
              </TouchableOpacity>
            ))}
            <Text style={[styles.sortSheetTitle, { color: t.text, marginTop: 12 }]}>顺序</Text>
            {(['asc', 'desc'] as FileSortDir[]).map((dir) => (
              <TouchableOpacity key={dir} style={[styles.sortOption, { borderBottomColor: t.border }]} onPress={() => setFileSort({ by: fileSort.by, dir })}>
                <Text style={[styles.sortOptionText, { color: t.text }]}>{dir === 'asc' ? '升序 ↑' : '降序 ↓'}</Text>
                <Text style={[styles.sortOptionMark, { color: fileSort.dir === dir ? t.primary : 'transparent' }]}>●</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.sortCancel} onPress={() => setSortOpen(false)}>
              <Text style={[styles.actionText, { color: t.primary }]}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={downloadManageOpen} transparent animationType="slide" onRequestClose={() => setDownloadManageOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setDownloadManageOpen(false)} activeOpacity={1} />
          <View style={[styles.downloadSheet, { backgroundColor: t.card }]}>
            <View style={styles.downloadSheetHeader}>
              <Text style={[styles.downloadSheetTitle, { color: t.text }]}>下载管理</Text>
              <TouchableOpacity onPress={() => setDownloadManageOpen(false)}>
                <Text style={[styles.downloadSheetClose, { color: t.primary }]}>关闭</Text>
              </TouchableOpacity>
            </View>
            {downloadTasks.length === 0 ? (
              <Text style={[styles.downloadEmpty, { color: t.textMuted }]}>暂无下载任务</Text>
            ) : (
              <FlatList
                data={[...downloadTasks].reverse()}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => {
                  const p = item.progress
                  const pct = p.totalBytes > 0 ? Math.round(p.bytesDownloaded / p.totalBytes * 100) : 0
                  const statusText = p.status === 'pending' ? '等待中' : p.status === 'running' ? `下载中 ${pct}%` : p.status === 'paused' ? '已暂停' : p.status === 'successful' ? '已完成' : p.status === 'failed' ? `失败${p.reason ? `: ${p.reason}` : ''}` : ''
                  const isActive = p.status === 'pending' || p.status === 'running' || p.status === 'paused'
                  return (
                    <View style={[styles.downloadItem, { borderBottomColor: t.border }]}>
                      <Text style={[styles.downloadItemName, { color: t.text }]} numberOfLines={1}>{item.fileName}</Text>
                      {p.totalBytes > 0 && (
                        <View style={[styles.progressBar, { backgroundColor: t.border }]}>
                          <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: p.status === 'failed' ? t.danger : t.primary }]} />
                        </View>
                      )}
                      <Text style={[styles.downloadItemStatus, { color: p.status === 'failed' ? t.danger : p.status === 'successful' ? t.success : t.textMuted }]}>{statusText}</Text>
                      {isActive && (
                        <TouchableOpacity style={styles.downloadItemCancel} onPress={() => { cancelDownload(item.id); removeDownloadTask(item.id) }}>
                          <Text style={[styles.downloadItemCancelText, { color: t.danger }]}>取消</Text>
                        </TouchableOpacity>
                      )}
                      {p.status === 'successful' && (
                        <TouchableOpacity style={styles.downloadItemCancel} onPress={() => { removeDownload(item.id); removeDownloadTask(item.id) }}>
                          <Text style={[styles.downloadItemCancelText, { color: t.textMuted }]}>移除</Text>
                        </TouchableOpacity>
                      )}
                      {p.status === 'failed' && (
                        <TouchableOpacity style={styles.downloadItemCancel} onPress={() => { removeDownload(item.id); removeDownloadTask(item.id) }}>
                          <Text style={[styles.downloadItemCancelText, { color: t.textMuted }]}>移除</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={searchModalOpen} animationType="slide" onRequestClose={() => { if (searchLoading) { stopSearch() } else { searchAbortRef.current?.abort(); setSearchResults([]); setSearchModalOpen(false) } }}>
        <View style={[styles.container, { backgroundColor: t.bg, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0 }]}>
          <View style={[styles.modalHeader, { backgroundColor: t.headerBg, borderBottomColor: t.border }]}>
            <Text style={[styles.modalTitle, { color: t.text }]}>搜索</Text>
            <TouchableOpacity onPress={() => { searchAbortRef.current?.abort(); setSearchResults([]); setSearchModalOpen(false) }}>
              <Text style={[styles.toolbarAction, { color: t.primary }]}>关闭</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.searchModalBar, { backgroundColor: t.card, borderBottomColor: t.border }]}>
            <TextInput
              autoFocus
              style={[styles.searchModalInput, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={() => doSearch(searchQuery, searchCategory)}
              placeholder="搜索文件和文件夹"
              placeholderTextColor={t.textMuted}
              returnKeyType="search"
            />
            <TouchableOpacity style={styles.searchCategoryBtn} onPress={() => setSearchCategoryOpen(true)}>
              <Text style={[styles.searchCategoryText, { color: t.text }]}>{SEARCH_CATEGORIES.find((c) => c.value === searchCategory)?.label ?? '所有类型'}</Text>
              <Icon name="sortArrow" size={12} color={t.textMuted} style={{ marginLeft: 2 }} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.searchActionBtn} onPress={() => searchLoading ? stopSearch() : doSearch(searchQuery, searchCategory)}>
              <Text style={[styles.searchActionText2, { color: t.primary }]}>{searchLoading ? '停止' : '搜索'}</Text>
            </TouchableOpacity>
          </View>
          {searchLoading && searchResults.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={t.primary} />
              <Text style={[styles.emptySub, { color: t.textMuted, marginTop: 8 }]}>搜索中...</Text>
            </View>
          ) : searchError ? (
            <View style={styles.center}>
              <Text style={[styles.errorText, { color: t.danger }]}>{searchError}</Text>
            </View>
          ) : searchResults.length === 0 && !searchLoading ? (
            <View style={styles.center}>
              <Text style={[styles.emptySub, { color: t.textMuted }]}>输入关键词开始搜索</Text>
            </View>
          ) : (
            <>
              {searchLoading && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8 }}>
                  <ActivityIndicator size="small" color={t.primary} />
                  <Text style={[styles.emptySub, { color: t.textMuted, marginLeft: 8 }]}>搜索中...</Text>
                </View>
              )}
              <FlatList
                data={searchResults}
                keyExtractor={(item, index) => `${item.path}-${index}`}
                renderItem={({ item }) => {
                  const parentDir = item.path.split('/').filter(Boolean).slice(0, -1).join('/')
                  return (
                    <TouchableOpacity style={[styles.searchResultItem, { borderBottomColor: t.border }]} onPress={() => { setSearchModalOpen(false); if (item.isDirectory) loadDir(item.path); else loadDir(parentDir ? `/${parentDir}` : '/') }}>
                      <Icon name={item.isDirectory ? 'folderContent' : getFileIcon(item.name)} size={24} color={t.primary} />
                      <View style={styles.searchResultInfo}>
                        <Text style={[styles.searchResultName, { color: t.text }]} numberOfLines={1}>{item.name}</Text>
                        <Text style={[styles.searchResultPath, { color: t.textMuted }]} numberOfLines={1}>{item.path}</Text>
                      </View>
                      {!item.isDirectory && <Text style={[styles.searchResultSize, { color: t.textMuted }]}>{(item.size / 1024).toFixed(1)} KB</Text>}
                    </TouchableOpacity>
                  )
                }}
              />
            </>
          )}
        </View>
      </Modal>

      <Modal visible={searchCategoryOpen} transparent animationType="slide" onRequestClose={() => setSearchCategoryOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setSearchCategoryOpen(false)} activeOpacity={1} />
          <View style={[styles.categorySheet, { backgroundColor: t.card }]}>
            <Text style={[styles.categorySheetTitle, { color: t.text }]}>搜索类别</Text>
            {SEARCH_CATEGORIES.map((cat) => (
              <TouchableOpacity key={cat.value} style={[styles.categoryOption, { borderBottomColor: t.border }]} onPress={() => { setSearchCategory(cat.value as SearchCategory); setSearchCategoryOpen(false) }}>
                <Text style={[styles.categoryOptionText, { color: t.text }]}>{cat.label}</Text>
                <Text style={[styles.categoryOptionMark, { color: searchCategory === cat.value ? t.primary : 'transparent' }]}>●</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.sortCancel} onPress={() => setSearchCategoryOpen(false)}>
              <Text style={[styles.actionText, { color: t.primary }]}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Animated.View pointerEvents="none" style={[styles.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}>
        <View style={[styles.toastInner, { backgroundColor: '#000' }]}>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 }, withServiceBar: { paddingTop: 96 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyIcon: { fontSize: 40, marginBottom: 12 }, emptyTitle: { fontSize: 16, fontWeight: '600' }, emptySub: { fontSize: 13, textAlign: 'center', marginTop: 4 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth }, headerButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, headerTitle: { flex: 1, alignItems: 'center' }, headerTitleText: { fontSize: 17, fontWeight: '700' },
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 }, searchInput: { flex: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderWidth: 1 }, searchAction: { minWidth: 56, paddingHorizontal: 6, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' }, searchActionText: { fontSize: 14, fontWeight: '600' },
  pathRow: { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth }, pathLabel: { fontSize: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth }, toolbarSpacer: { flex: 1 }, toolbarButton: { minWidth: 56, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 }, toolbarAction: { fontSize: 14, fontWeight: '600' }, iconButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, toolbarIcon: { fontSize: 22, fontWeight: '500' },
  sortButton: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, minHeight: 36 }, sortButtonText: { fontSize: 13, fontWeight: '600' },
  spinnerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 10 }, errorText: { fontSize: 13, textAlign: 'center', padding: 10 },
  list: { flex: 1 }, listContent: { paddingBottom: 48 }, listContentWithBar: { paddingBottom: 110 },
  fileItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, minHeight: 72, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  gridRow: { gap: 10, paddingHorizontal: 10, paddingTop: 10 }, gridFileItem: { flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 18, minHeight: 132, borderWidth: 1, borderRadius: 14, marginBottom: 4, position: 'relative' },
  fileInfo: { flex: 1 }, fileName: { fontSize: 15 }, fileSize: { fontSize: 12, marginTop: 2 },
  moreButton: { width: 36, height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: 4 }, moreDot: { width: 4, height: 4, borderRadius: 2 },
  checkboxWrap: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 4, alignItems: 'center', justifyContent: 'center' }, checkboxInner: { width: 12, height: 12, borderRadius: 2 },
  gridCheckbox: { position: 'absolute', top: 8, right: 8, padding: 4 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 76, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4 }, selectedCount: { flex: 1, fontSize: 14, fontWeight: '700', paddingHorizontal: 6 }, bottomAction: { minWidth: 64, minHeight: 60, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }, bottomActionText: { fontSize: 14, fontWeight: '700' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth }, modalTitle: { fontSize: 17, fontWeight: '700' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }, modalBackdrop: { ...StyleSheet.absoluteFill },
  actionSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 4 }, editSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  sortSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 }, sortSheetTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6 }, sortOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth }, sortOptionText: { fontSize: 16, fontWeight: '500' }, sortOptionMark: { fontSize: 18, marginLeft: 12 }, sortCancel: { alignItems: 'center', paddingTop: 14 },
  actionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 }, actionButton: { minHeight: 56, justifyContent: 'center', alignItems: 'center', borderRadius: 10, paddingHorizontal: 12 }, actionText: { fontSize: 16, fontWeight: '600' },
  editInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, minHeight: 52 }, editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 28, paddingTop: 18 },
  toast: { position: 'absolute', left: 0, right: 0, bottom: 120, alignItems: 'center' }, toastInner: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24 }, toastText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  shareCreateBody: { padding: 20, gap: 16 },
  sharePath: { fontSize: 15, fontWeight: '600' },
  shareToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12 },
  shareToggleLabel: { fontSize: 15, fontWeight: '600' },
  shareToggleDot: { width: 18, height: 18, borderRadius: 9 },
  shareInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, minHeight: 52 },
  shareSectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  shareExpiryRow: { flexDirection: 'row', gap: 10 },
  shareExpiryOption: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1 },
  shareExpiryText: { fontSize: 14, fontWeight: '600' },
  shareCreateBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  shareCreateBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  shareItem: { paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  shareItemPath: { fontSize: 15, fontWeight: '600' },
  shareItemLink: { fontSize: 12 },
  shareItemMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareItemDate: { fontSize: 12 },
  shareItemBadge: { fontSize: 12 },
  shareItemActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  shareItemBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  shareItemBtnText: { fontSize: 12, fontWeight: '600' },

  storageBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  storageBannerText: { fontSize: 13, fontWeight: '600' },

  downloadSheet: { maxHeight: '70%', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 16, paddingBottom: 32 },
  downloadSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  downloadSheetTitle: { fontSize: 17, fontWeight: '700' },
  downloadSheetClose: { fontSize: 15, fontWeight: '600' },
  downloadEmpty: { textAlign: 'center', padding: 24, fontSize: 14 },
  downloadItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  downloadItemName: { flex: 1, fontSize: 14, fontWeight: '600' },
  progressBar: { height: 4, borderRadius: 2, flex: 1, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  downloadItemStatus: { fontSize: 12, minWidth: 60, textAlign: 'right' },
  downloadItemCancel: { paddingHorizontal: 8, paddingVertical: 4 },
  downloadItemCancelText: { fontSize: 13, fontWeight: '600' },

  searchModalBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  searchModalInput: { flex: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderWidth: 1 },
  searchCategoryBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 },
  searchCategoryText: { fontSize: 12, fontWeight: '600' },
  searchActionBtn: { minWidth: 56, paddingHorizontal: 6, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  searchActionText2: { fontSize: 14, fontWeight: '600' },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  searchResultInfo: { flex: 1 },
  searchResultName: { fontSize: 15 },
  searchResultPath: { fontSize: 12, marginTop: 1 },
  searchResultSize: { fontSize: 12, minWidth: 60, textAlign: 'right' },

  categorySheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  categorySheetTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  categoryOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  categoryOptionText: { fontSize: 16, fontWeight: '500' },
  categoryOptionMark: { fontSize: 18, marginLeft: 12 },
})
