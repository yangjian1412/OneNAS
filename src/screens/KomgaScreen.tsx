import { useEffect, useState, useRef } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, BackHandler, StyleSheet, Modal, Alert, Platform, StatusBar } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useKomgaStore } from '@/stores/komgaStore'
import { komgaListSeries, komgaListBooks, komgaGlobalSearch } from '@/lib/api/komga'
import { getCachedBookList } from '@/lib/api/komgaCache'
import type { ServiceConfig, KomgaSeries, KomgaBook, KomgaLibrary, KomgaSortKey, KomgaSortDir } from '@/types'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import KomgaHeader from '@/components/komga/KomgaHeader'
import ServiceDrawer, { DrawerItem } from '@/components/ServiceDrawer'
import KomgaMangaDetail from '@/components/komga/KomgaMangaDetail'
import KomgaReader from '@/components/komga/KomgaReader'
import KomgaCacheSettings from '@/components/komga/KomgaCacheSettings'
import { KomgaSeriesRow, KomgaBookRow } from '@/components/komga/KomgaGrid'
import { KomgaSeriesCard } from '@/components/komga/KomgaCoverArt'

type ViewType = 'home' | 'library' | 'series' | 'reader' | 'search'

interface Props {
  service: ServiceConfig
  onRequestClose?: () => void
}

export default function KomgaScreen({ service, onRequestClose }: Props) {
  const t = useTheme()
  const isFocused = useIsFocused()
  const isFocusedRef = useRef(isFocused)
  isFocusedRef.current = isFocused

  const {
    server, libraries, continueReading, newByLibrary,
    loading, error,
    initWithService, refresh,
  } = useKomgaStore()

  const [view, setView] = useState<ViewType>('home')
  const [viewStack, setViewStack] = useState<ViewType[]>([])

  const [selectedLibrary, setSelectedLibrary] = useState<KomgaLibrary | null>(null)
  const [librarySeries, setLibrarySeries] = useState<KomgaSeries[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [librarySortKey, setLibrarySortKey] = useState<KomgaSortKey>('name')
  const [librarySortDir, setLibrarySortDir] = useState<KomgaSortDir>('asc')
  const [sortPickerOpen, setSortPickerOpen] = useState(false)

  const [selectedSeries, setSelectedSeries] = useState<KomgaSeries | null>(null)

  const [readingBook, setReadingBook] = useState<KomgaBook | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ series: KomgaSeries[]; books: KomgaBook[] } | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [cacheSettingsOpen, setCacheSettingsOpen] = useState(false)

  const [cachedEntries, setCachedEntries] = useState<Array<{ bookId: string; seriesTitle: string; bookTitle: string; pages: number; sizeBytes: number; cachedAt: number }>>([])

  useEffect(() => {
    void getCachedBookList().then(setCachedEntries)
  }, [])

  useEffect(() => {
    if (!server || server.id !== service.id) {
      void initWithService({
        id: service.id,
        name: service.name,
        url: service.url,
        username: service.username,
        password: service.password,
      })
    }
  }, [service.id])

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isFocusedRef.current) return false
      if (drawerOpen) { setDrawerOpen(false); return true }
      if (cacheSettingsOpen) { setCacheSettingsOpen(false); return true }
      if (sortPickerOpen) { setSortPickerOpen(false); return true }
      if (view === 'reader') { handleCloseReader(); return true }
      if (view === 'series') { popView(); return true }
      if (view === 'library') { popView(); return true }
      if (view === 'search') { popView(); return true }
      if (onRequestClose) { onRequestClose(); return true }
      return false
    })
    return () => sub.remove()
  }, [view, drawerOpen, cacheSettingsOpen, sortPickerOpen])

  const pushView = (v: ViewType) => {
    setViewStack((s) => [...s, view])
    setView(v)
  }
  const popView = () => {
    if (viewStack.length === 0) {
      if (onRequestClose) onRequestClose()
      return
    }
    const prev = viewStack[viewStack.length - 1]
    setViewStack((s) => s.slice(0, -1))
    setView(prev)
  }

  const handleSubmitSearch = async () => {
    if (!server) return
    const q = searchQuery.trim()
    if (!q) return
    setSearchLoading(true)
    pushView('search')
    try {
      const res = await komgaGlobalSearch(server, q)
      setSearchResults(res)
    } catch (e: any) {
      Alert.alert('搜索失败', e?.message ?? '未知错误')
      setViewStack((s) => s.slice(0, -1))
      setView(view)
    } finally {
      setSearchLoading(false)
    }
  }

  const openLibrary = async (lib: KomgaLibrary) => {
    if (!server) return
    setSelectedLibrary(lib)
    setLibrarySortKey('name')
    setLibrarySortDir('asc')
    pushView('library')
    await loadLibrarySeries(lib, 'name', 'asc')
  }

  const loadLibrarySeries = async (lib: KomgaLibrary, sortKey: KomgaSortKey, sortDir: KomgaSortDir) => {
    if (!server) return
    setLibraryLoading(true)
    try {
      const sortField = sortKey === 'name' ? 'name' : 'createdDate'
      const sort = `${sortField},${sortDir}`
      const series = await komgaListSeries(server, { libraryIds: [lib.id], size: 50, sort })
      setLibrarySeries(series)
    } catch (e: any) {
      Alert.alert('加载失败', e?.message ?? '未知错误')
    } finally {
      setLibraryLoading(false)
    }
  }

  const selectSortKey = (key: KomgaSortKey) => {
    setLibrarySortKey(key)
    setSortPickerOpen(false)
    if (selectedLibrary) void loadLibrarySeries(selectedLibrary, key, librarySortDir)
  }

  const toggleSortDir = () => {
    const newDir: KomgaSortDir = librarySortDir === 'asc' ? 'desc' : 'asc'
    setLibrarySortDir(newDir)
    if (selectedLibrary) void loadLibrarySeries(selectedLibrary, librarySortKey, newDir)
  }

  const openSeries = (s: KomgaSeries) => {
    setSelectedSeries(s)
    pushView('series')
  }

  const openBook = (b: KomgaBook) => {
    setReadingBook(b)
    pushView('reader')
  }

  const handleCloseReader = () => {
    if (readingBook && server) {
      void komgaListBooks(server, { seriesId: [readingBook.seriesId], size: 1 }).catch(() => {})
    }
    setReadingBook(null)
    popView()
  }

  const drawerItems: DrawerItem[] = [
    { key: 'cache', label: '缓存管理', onPress: () => { setDrawerOpen(false); setCacheSettingsOpen(true) } },
  ]

  if (!server) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        {error ? (
          <>
            <Icon name="alertCircle" size={48} color={t.danger} />
            <Text style={[styles.error, { color: t.danger }]}>{error}</Text>
          </>
        ) : (
          <ActivityIndicator size="large" color={t.primary} />
        )}
      </View>
    )
  }

  const showBack = view !== 'home'

  const header = (
    <KomgaHeader
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onSubmitSearch={handleSubmitSearch}
      onClearSearch={() => { setSearchQuery(''); setSearchResults(null) }}
      showBack={showBack}
      onBackPress={popView}
      onMenuPress={() => setDrawerOpen(true)}
    />
  )

  // 本地缓存books
  const cachedBooks: KomgaBook[] = cachedEntries.map((e) => ({
    id: e.bookId,
    seriesId: '',
    seriesTitle: e.seriesTitle,
    libraryId: '',
    name: e.bookTitle,
    number: 0,
    sortNumber: 0,
    url: '',
    sizeBytes: e.sizeBytes,
    created: '',
    lastModified: '',
    media: { status: '', mediaType: '', pagesCount: e.pages },
    metadata: { title: e.bookTitle, number: '', authors: [], tags: [] },
    oneshot: false,
  }))

  // 继续阅读：服务端返回 + 本地缓存（去重）
  const continueReadingMerged: KomgaBook[] = (() => {
    const serverIds = new Set(continueReading.map((b) => b.id))
    const localOnly = cachedBooks.filter((b) => !serverIds.has(b.id))
    return [...continueReading, ...localOnly]
  })()

  if (view === 'home') {
    return (
      <View style={[styles.root, { backgroundColor: t.bg }]}>
        {header}
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {error && (
            <View style={[styles.errCard, { backgroundColor: t.danger + '15', borderColor: t.danger }]}>
              <Text style={{ color: t.danger }}>{error}</Text>
            </View>
          )}
          {loading && continueReadingMerged.length === 0 && Object.keys(newByLibrary).length === 0 ? (
            <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />
          ) : (
            <>
              {cachedBooks.length > 0 && (
                <KomgaBookRow
                  title="本地缓存"
                  server={server}
                  items={cachedBooks}
                  onItemPress={openBook}
                />
              )}

              <KomgaBookRow
                title="继续阅读"
                server={server}
                items={continueReadingMerged}
                onItemPress={openBook}
              />

              {libraries
                .filter((lib) => !lib.unavailable)
                .map((lib) => (
                  <KomgaSeriesRow
                    key={lib.id}
                    title={lib.name}
                    server={server}
                    items={newByLibrary[lib.id] ?? []}
                    onItemPress={openSeries}
                    rightAction={{ label: '查看全部', onPress: () => openLibrary(lib) }}
                  />
                ))}
            </>
          )}
        </ScrollView>
        <ServiceDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} userInfo={{ name: server.name, url: server.url, avatar: server.username }} items={drawerItems} t={t} />
        <KomgaCacheSettings visible={cacheSettingsOpen} onClose={() => setCacheSettingsOpen(false)} t={t} />
      </View>
    )
  }

  if (view === 'library' && selectedLibrary) {
    return (
      <View style={[styles.root, { backgroundColor: t.bg }]}>
        {header}
        {/* 标题行：左=库名+漫画数，右=排序控制 */}
        <View style={[styles.libHeaderRow, { borderBottomColor: t.border }]}>
          <View style={styles.libHeaderLeft}>
            <Text style={[styles.libHeaderTitle, { color: t.text }]} numberOfLines={1}>{selectedLibrary.name}</Text>
            <Text style={[styles.libHeaderCount, { color: t.textMuted }]}>{librarySeries.length} 部</Text>
          </View>
          <View style={styles.sortRow}>
            <TouchableOpacity onPress={() => setSortPickerOpen(true)} activeOpacity={0.7}>
              <Text style={[styles.sortFieldText, { color: t.primary }]}>
                {librarySortKey === 'name' ? '名称' : '加入时间'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleSortDir} style={styles.sortArrowBtn}>
              <Icon name="chevronUp" size={14} color={librarySortDir === 'asc' ? t.primary : t.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleSortDir} style={styles.sortArrowBtn}>
              <Icon name="chevronDown" size={14} color={librarySortDir === 'desc' ? t.primary : t.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
        {libraryLoading ? (
          <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {librarySeries.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={[styles.seriesRow, { backgroundColor: t.card, borderColor: t.border }]}
                onPress={() => openSeries(s)}
                activeOpacity={0.7}
              >
                <KomgaSeriesCard server={server} series={s} onPress={() => openSeries(s)} size={70} />
                <View style={styles.seriesRowMeta}>
                  <Text style={[styles.seriesRowTitle, { color: t.text }]} numberOfLines={2}>
                    {s.metadata?.title || s.name}
                  </Text>
                  <Text style={[styles.seriesRowSub, { color: t.textMuted }]} numberOfLines={1}>
                    {s.booksCount} 本 · {s.booksReadCount} 已读
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        {/* 排序字段选择 dropdown */}
        <Modal visible={sortPickerOpen} transparent animationType="fade" onRequestClose={() => setSortPickerOpen(false)}>
          <TouchableOpacity style={styles.sortOverlay} activeOpacity={1} onPress={() => setSortPickerOpen(false)}>
            <View style={{ marginTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 44 : 44, marginRight: 16, alignSelf: 'flex-end' }}>
              <View style={[styles.sortDropdown, { backgroundColor: t.card, borderColor: t.border }]}>
                {([
                  { key: 'name' as const, label: '名称' },
                  { key: 'added' as const, label: '加入时间' },
                ]).map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.sortOption, { borderBottomColor: t.border }]}
                    onPress={() => selectSortKey(opt.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.sortOptionText, { color: t.text }]}>{opt.label}</Text>
                    {librarySortKey === opt.key && <Icon name="check" size={14} color={t.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
        <ServiceDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} userInfo={{ name: server.name, url: server.url, avatar: server.username }} items={drawerItems} t={t} />
        <KomgaCacheSettings visible={cacheSettingsOpen} onClose={() => setCacheSettingsOpen(false)} t={t} />
      </View>
    )
  }

  if (view === 'series' && selectedSeries) {
    return (
      <View style={[styles.root, { backgroundColor: t.bg }]}>
        {header}
        <KomgaMangaDetail key={selectedSeries.id} server={server} series={selectedSeries} onOpenBook={openBook} />
        <ServiceDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} userInfo={{ name: server.name, url: server.url, avatar: server.username }} items={drawerItems} t={t} />
        <KomgaCacheSettings visible={cacheSettingsOpen} onClose={() => setCacheSettingsOpen(false)} t={t} />
      </View>
    )
  }

  if (view === 'reader' && readingBook) {
    return (
      <View style={[styles.root, { backgroundColor: '#000' }]}>
        <KomgaReader server={server} book={readingBook} onClose={handleCloseReader} />
      </View>
    )
  }

  if (view === 'search') {
    return (
      <View style={[styles.root, { backgroundColor: t.bg }]}>
        {header}
        {searchLoading ? (
          <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />
        ) : searchResults ? (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {searchResults.series.length === 0 && searchResults.books.length === 0 ? (
              <Text style={[styles.empty, { color: t.textMuted }]}>无结果</Text>
            ) : (
              <>
                {searchResults.series.length > 0 && (
                  <KomgaSeriesRow
                    title={`系列（${searchResults.series.length}）`}
                    server={server}
                    items={searchResults.series}
                    onItemPress={openSeries}
                  />
                )}
                {searchResults.books.length > 0 && (
                  <KomgaBookRow
                    title={`章节（${searchResults.books.length}）`}
                    server={server}
                    items={searchResults.books}
                    onItemPress={openBook}
                  />
                )}
              </>
            )}
          </ScrollView>
        ) : null}
        <ServiceDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} userInfo={{ name: server.name, url: server.url, avatar: server.username }} items={drawerItems} t={t} />
        <KomgaCacheSettings visible={cacheSettingsOpen} onClose={() => setCacheSettingsOpen(false)} t={t} />
      </View>
    )
  }

  return null
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  scrollContent: { paddingVertical: 16 },
  errCard: { margin: 12, padding: 12, borderRadius: 8, borderWidth: 1 },
  error: { fontSize: 14, marginTop: 12, textAlign: 'center' },
  empty: { fontSize: 14, paddingVertical: 30, textAlign: 'center' },
  // 库标题行
  libHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  libHeaderLeft: { flex: 1, marginRight: 12 },
  libHeaderTitle: { fontSize: 16, fontWeight: '700' },
  libHeaderCount: { fontSize: 11, marginTop: 2 },
  // 排序栏
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortFieldText: { fontSize: 13, fontWeight: '600', marginRight: 2 },
  sortArrowBtn: { padding: 4 },
  // 排序 dropdown
  sortOverlay: { flex: 1 },
  sortDropdown: {
    borderRadius: 10, borderWidth: 1, overflow: 'hidden',
    minWidth: 120, elevation: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8,
  },
  sortOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sortOptionText: { fontSize: 14 },
  // 库详情列表
  seriesRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 10, padding: 10,
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
  },
  seriesRowMeta: { flex: 1, marginLeft: 12 },
  seriesRowTitle: { fontSize: 14, fontWeight: '600' },
  seriesRowSub: { fontSize: 11, marginTop: 4 },
})
