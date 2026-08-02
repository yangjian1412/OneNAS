import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  Modal,
  FlatList,
  BackHandler,
} from 'react-native'
import { useTheme } from '@/lib/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Icon from '@/components/Icon'
import { ServiceConfig, AudiobookshelfLibraryItem, AudiobookshelfLibrary, AudiobookshelfSearchResults, AudiobookshelfBookMedia } from '@/types'
import { useAudiobookshelfStore } from '@/stores/audiobookshelfStore'
import { useAudiobookshelfPlaybackStore } from '@/stores/audiobookshelfPlaybackStore'
import {
  audiobookshelfGetLibraries,
  audiobookshelfGetResume,
  audiobookshelfGetRecentlyAdded,
  audiobookshelfGetLibraryItems,
  audiobookshelfSearch,
  audiobookshelfGetCoverUrl,
  audiobookshelfPlayItem,
  audiobookshelfGetItem,
} from '@/lib/api/audiobookshelf'
import AudiobookshelfHeader from '@/components/audiobookshelf/AudiobookshelfHeader'
import AudiobookshelfDrawer from '@/components/audiobookshelf/AudiobookshelfDrawer'
import AudiobookshelfResumeRow from '@/components/audiobookshelf/AudiobookshelfResumeRow'
import AudiobookshelfLibraryRow from '@/components/audiobookshelf/AudiobookshelfLibraryRow'
import AudiobookshelfItemDetail from '@/components/audiobookshelf/AudiobookshelfItemDetail'
import AudiobookshelfPlayer from '@/components/audiobookshelf/AudiobookshelfPlayer'
import AudiobookshelfMiniPlayer from '@/components/audiobookshelf/AudiobookshelfMiniPlayer'
import { useAudiobookshelfPlayerStore } from '@/stores/audiobookshelfPlayerStore'
import AudiobookshelfPlaybackSettings from '@/components/audiobookshelf/AudiobookshelfPlaybackSettings'

const SCREEN_W = Dimensions.get('window').width

interface Props {
  service: ServiceConfig
  onRequestClose?: () => void
}

type ViewType = 'home' | 'library' | 'itemDetail'

const ABS_SORT_OPTIONS = [
  { label: '名称', value: 'media.metadata.title' },
  { label: '加入时间', value: 'addedAt' },
]

export default function AudiobookshelfScreen({ service, onRequestClose }: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()

  const server = useAudiobookshelfStore((s) => s.server)
  const prefsLoad = useAudiobookshelfPlaybackStore((s) => s.loadFromStorage)
  const libraries = useAudiobookshelfStore((s) => s.libraries)
  const resumeItems = useAudiobookshelfStore((s) => s.resumeItems)
  const recentByLibrary = useAudiobookshelfStore((s) => s.recentByLibrary)
  const initWithService = useAudiobookshelfStore((s) => s.initWithService)
  const setLibraries = useAudiobookshelfStore((s) => s.setLibraries)
  const setResumeItems = useAudiobookshelfStore((s) => s.setResumeItems)
  const setRecentForLibrary = useAudiobookshelfStore((s) => s.setRecentForLibrary)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serverVersion, setServerVersion] = useState<string | undefined>()

  const [view, setView] = useState<ViewType>('home')
  const [viewStack, setViewStack] = useState<ViewType[]>([])

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [playbackSettingsOpen, setPlaybackSettingsOpen] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AudiobookshelfSearchResults | null>(null)

  const [currentLibrary, setCurrentLibrary] = useState<AudiobookshelfLibrary | null>(null)
  const [libraryItems, setLibraryItems] = useState<AudiobookshelfLibraryItem[]>([])
  const [sortBy, setSortBy] = useState('media.metadata.title')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [showSortField, setShowSortField] = useState(false)

  const [currentItem, setCurrentItem] = useState<AudiobookshelfLibraryItem | null>(null)

  const [playerItem, setPlayerItem] = useState<AudiobookshelfLibraryItem | null>(null)
  const [playerStartAt, setPlayerStartAt] = useState<number | null>(null)
  const [playerVisible, setPlayerVisible] = useState(false)
  const [playerResumeExisting, setPlayerResumeExisting] = useState(false)

  const loadingRef = useRef(false)
  const drawerRef = useRef(false)
  const viewRef = useRef<ViewType>('home')

  useEffect(() => { viewRef.current = view }, [view])
  useEffect(() => { loadingRef.current = loading }, [loading])
  useEffect(() => { drawerRef.current = drawerOpen }, [drawerOpen])

  const currentSort = ABS_SORT_OPTIONS.find((o) => o.value === sortBy) ?? ABS_SORT_OPTIONS[0]

  useEffect(() => { void prefsLoad() }, [prefsLoad])

  // ===== init / login =====
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      const result = await initWithService(service)
      if (cancelled) return
      if (!result.ok || !result.server) {
        setError(result.error ?? '初始化失败')
        setLoading(false)
        return
      }
      setServerVersion(result.serverVersion)
      // load libraries + resume + recent
      const [libsRes, resumeRes] = await Promise.all([
        audiobookshelfGetLibraries(result.server!),
        audiobookshelfGetResume(result.server!, 12),
      ])
      if (cancelled) return
      if (libsRes.ok && libsRes.libraries) setLibraries(libsRes.libraries)
      if (resumeRes.ok && resumeRes.items) setResumeItems(resumeRes.items)
      // load recently-added for each library (limit 6)
      const allLibs = libsRes.libraries ?? []
      const recentResults = await Promise.all(
        allLibs.map((lib) => audiobookshelfGetRecentlyAdded(result.server!, lib.id, 6))
      )
      if (cancelled) return
      allLibs.forEach((lib, idx) => {
        const r = recentResults[idx]
        if (r.ok && r.items) setRecentForLibrary(lib.id, r.items)
      })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [service.id])

  // ===== search =====
  const handleSearch = useCallback(async () => {
    if (!server || !searchQuery.trim()) return
    // Search in the first book library (or first library)
    const bookLib = libraries.find((l) => l.mediaType === 'book') ?? libraries[0]
    if (!bookLib) return
    setLoading(true)
    const result = await audiobookshelfSearch(server, bookLib.id, searchQuery.trim(), 12)
    setLoading(false)
    if (result.ok) {
      setSearchResults(result.results ?? {})
    }
  }, [server, searchQuery, libraries])

  const goBack = useCallback(() => {
    if (loadingRef.current) return
    if (drawerRef.current) { setDrawerOpen(false); return }
    if (viewStack.length > 0) {
      setViewStack((s) => s.slice(0, -1))
      setView(viewStack[viewStack.length - 1])
      return
    }
    if (view !== 'home') { setView('home'); return }
  }, [view, viewStack])

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (drawerRef.current || viewRef.current !== 'home' || viewStack.length > 0) {
        goBack()
        return true
      }
      if (onRequestClose) {
        onRequestClose()
        return true
      }
      return false
    })
    return () => sub.remove()
  }, [goBack, viewStack.length, onRequestClose])


  // ===== library drill-down =====
  const handleLibraryPress = useCallback(async (lib: AudiobookshelfLibrary) => {
    if (!server) return
    setCurrentLibrary(lib)
    setViewStack((s) => [...s, viewRef.current])
    setView('library')
    setLoading(true)
    const result = await audiobookshelfGetLibraryItems(server, lib.id, {
      limit: 50,
      page: 0,
      sort: sortBy,
      desc: sortDir === 'desc',
      minified: true,
    })
    setLoading(false)
    if (result.ok && result.items) setLibraryItems(result.items)
  }, [server, sortBy, sortDir])

  const handleSortFieldChange = useCallback(async (value: string) => {
    if (!server || !currentLibrary) return
    setSortBy(value)
    setShowSortField(false)
    setLoading(true)
    const result = await audiobookshelfGetLibraryItems(server, currentLibrary.id, {
      limit: 50,
      page: 0,
      sort: value,
      desc: sortDir === 'desc',
      minified: true,
    })
    setLoading(false)
    if (result.ok && result.items) setLibraryItems(result.items)
  }, [server, currentLibrary, sortDir])

  const handleSortDirChange = useCallback(async (dir: 'asc' | 'desc') => {
    if (!server || !currentLibrary) return
    setSortDir(dir)
    setLoading(true)
    const result = await audiobookshelfGetLibraryItems(server, currentLibrary.id, {
      limit: 50,
      page: 0,
      sort: sortBy,
      desc: dir === 'desc',
      minified: true,
    })
    setLoading(false)
    if (result.ok && result.items) setLibraryItems(result.items)
  }, [server, currentLibrary, sortBy])

  // ===== item detail =====
  const handleItemPress = useCallback((item: AudiobookshelfLibraryItem) => {
    setCurrentItem(item)
    setViewStack((s) => [...s, viewRef.current])
    setView('itemDetail')
  }, [])

  // ===== play =====
  const handlePlay = useCallback(async (item: AudiobookshelfLibraryItem, startAt?: number) => {
    if (!server) return
    const st = useAudiobookshelfPlayerStore.getState()
    if (st.session && st.currentItem && st.currentItem.id !== item.id) {
      st.controls?.stop()
    }
    let playItem = item
    try {
      const detail = await audiobookshelfGetItem(server, item.id, true)
      if (detail.ok && detail.item) playItem = detail.item
    } catch {}
    setPlayerItem(playItem)
    setPlayerStartAt(startAt ?? null)
    setPlayerResumeExisting(false)
    setPlayerVisible(true)
  }, [server])

  const openMiniPlayer = useCallback(() => {
    const st = useAudiobookshelfPlayerStore.getState()
    if (st.currentItem && playerItem && st.currentItem.id === playerItem.id) {
      setPlayerResumeExisting(true)
    } else {
      setPlayerResumeExisting(false)
    }
    setPlayerVisible(true)
  }, [playerItem])

  const closePlayer = useCallback(() => {
    setPlayerVisible(false)
  }, [])

  const stopAndClearPlayer = useCallback(() => {
    useAudiobookshelfPlayerStore.getState().controls?.stop()
    setPlayerItem(null)
    setPlayerStartAt(null)
    setPlayerVisible(false)
    setPlayerResumeExisting(false)
  }, [])

  // ===== UI =====
  const isHome = view === 'home'
  const showSortControl = view === 'library'

  return (
    <View style={[styles.screen, { backgroundColor: t.bg }]}>
      <AudiobookshelfHeader
        isHome={isHome}
        searchQuery={searchQuery}
        onChangeSearch={setSearchQuery}
        onSubmitSearch={handleSearch}
        onClearSearch={() => { setSearchQuery(''); setSearchResults(null) }}
        onMenu={() => setDrawerOpen(true)}
        onBack={goBack}
        onSearchFocus={() => {}}
      />

      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: t.card }]}>
          <Icon name="alertCircle" size={18} color="#ff6b6b" />
          <Text style={[styles.errorText, { color: t.text }]}>{error}</Text>
          <TouchableOpacity
            onPress={() => {
              setError(null)
              setLoading(true)
              initWithService(service).then((r) => {
                setLoading(false)
                if (!r.ok) setError(r.error ?? '连接失败')
              })
            }}
            style={styles.retryBtn}
          >
            <Text style={[styles.retryText, { color: t.primary }]}>重试</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {view === 'home' && (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {loading && libraries.length === 0 ? (
            <View style={styles.loading}><ActivityIndicator color={t.primary} /></View>
          ) : null}

          {searchResults ? (
            <SearchResultsView
              results={searchResults}
              onItemPress={(item) => {
                setSearchResults(null)
                setSearchQuery('')
                handleItemPress(item)
              }}
            />
          ) : (
            <>
              <AudiobookshelfResumeRow
                server={server!}
                items={resumeItems}
                onItemPress={handleItemPress}
              />

              {libraries.map((lib) => (
                <AudiobookshelfLibraryRow
                  key={lib.id}
                  server={server!}
                  library={lib}
                  items={recentByLibrary[lib.id] ?? []}
                  onItemPress={handleItemPress}
                  onSeeAll={() => handleLibraryPress(lib)}
                />
              ))}

              {resumeItems.length === 0 && libraries.length === 0 && !loading ? (
                <View style={styles.empty}>
                  <Icon name="audiobookshelf" size={64} color={t.textMuted} />
                  <Text style={[styles.emptyText, { color: t.textMuted }]}>暂无内容</Text>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      )}

      {view === 'library' && currentLibrary && (
        <View style={{ flex: 1 }}>
          <View style={[styles.libraryHeader, { borderBottomColor: t.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.libraryTitle, { color: t.text }]}>{currentLibrary.name}</Text>
              <Text style={[styles.libraryMeta, { color: t.textMuted }]}>
                {libraryItems.length} 项 · {currentLibrary.mediaType === 'book' ? '有声书' : '播客'}
              </Text>
            </View>
            {showSortControl && (
              <View style={styles.sortRow}>
                <TouchableOpacity onPress={() => setShowSortField(true)} activeOpacity={0.7}>
                  <Text style={[styles.sortFieldText, { color: t.primary }]}>
                    {currentSort.label}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleSortDirChange('asc')}
                  style={styles.sortArrowBtn}
                >
                  <Icon name="chevronUp" size={14} color={sortDir === 'asc' ? t.primary : t.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleSortDirChange('desc')}
                  style={styles.sortArrowBtn}
                >
                  <Icon name="chevronDown" size={14} color={sortDir === 'desc' ? t.primary : t.textMuted} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {loading ? (
            <View style={styles.loading}><ActivityIndicator color={t.primary} /></View>
          ) : (
            <FlatList
              data={libraryItems}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={{ paddingHorizontal: 12, gap: 8 }}
              contentContainerStyle={{ paddingVertical: 12, paddingBottom: 24, gap: 12 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.libCard, { backgroundColor: t.card, borderColor: t.border }]}
                  activeOpacity={0.7}
                  onPress={() => handleItemPress(item)}
                >
                  <View style={styles.libCoverWrap}>
                    <CoverImage uri={audiobookshelfGetCoverUrl(server!, item.id, 220)} />
                  </View>
                  <Text style={[styles.libCardTitle, { color: t.text }]} numberOfLines={2}>
                    {item.media.metadata.title}
                  </Text>
                  <Text style={[styles.libCardSub, { color: t.textMuted }]} numberOfLines={1}>
                    {(item.media as AudiobookshelfBookMedia).metadata.authorName || ''}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={[styles.emptyText, { color: t.textMuted }]}>暂无内容</Text>
                </View>
              }
            />
          )}
        </View>
      )}

      {view === 'itemDetail' && currentItem && server && (
        <AudiobookshelfItemDetail
          item={currentItem}
          server={server}
          onPlay={(startAt) => handlePlay(currentItem, startAt)}
          onBack={goBack}
        />
      )}

      <AudiobookshelfDrawer
        visible={drawerOpen}
        server={server}
        serverVersion={serverVersion}
        onClose={() => setDrawerOpen(false)}
        onPlaybackSettings={() => setPlaybackSettingsOpen(true)}
      />
      <AudiobookshelfPlaybackSettings
        visible={playbackSettingsOpen}
        onClose={() => setPlaybackSettingsOpen(false)}
      />

      {playerVisible && playerItem && server && (
        <AudiobookshelfPlayer
          visible={playerVisible}
          server={server}
          item={playerItem}
          startAt={playerStartAt}
          resumeExisting={playerResumeExisting}
          onClose={closePlayer}
        />
      )}

      {!playerVisible && playerItem && server && (
        <AudiobookshelfMiniPlayer
          onOpen={openMiniPlayer}
          onClose={stopAndClearPlayer}
        />
      )}

      {/* Sort field modal */}
      <Modal transparent visible={showSortField} animationType="fade" onRequestClose={() => setShowSortField(false)}>
        <TouchableOpacity style={styles.sortOverlay} activeOpacity={1} onPress={() => setShowSortField(false)}>
          <View style={[styles.sortDropdown, { backgroundColor: t.card, borderColor: t.border }]}>
            {ABS_SORT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={styles.sortOption}
                onPress={() => handleSortFieldChange(opt.value)}
              >
                <Text style={[styles.sortOptionText, { color: t.text }]}>{opt.label}</Text>
                {sortBy === opt.value && <Icon name="check" size={18} color={t.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

function SearchResultsView({
  results,
  onItemPress,
}: {
  results: AudiobookshelfSearchResults
  onItemPress: (item: AudiobookshelfLibraryItem) => void
}) {
  const t = useTheme()
  const items = (results.book ?? results.podcast ?? []) as { libraryItem: AudiobookshelfLibraryItem }[]
  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: t.textMuted }]}>无搜索结果</Text>
      </View>
    )
  }
  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
      <Text style={[styles.libraryMeta, { color: t.textMuted, marginBottom: 8 }]}>
        搜索结果 · {items.length} 项
      </Text>
      {items.map(({ libraryItem }) => (
        <TouchableOpacity
          key={libraryItem.id}
          style={[styles.searchRow, { borderColor: t.border }]}
          onPress={() => onItemPress(libraryItem)}
        >
          <View style={styles.searchCover}>
            <CoverImage uri={audiobookshelfGetCoverUrl({ url: '', username: '', password: '' } as any, libraryItem.id, 80)} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.libCardTitle, { color: t.text }]} numberOfLines={2}>
              {libraryItem.media.metadata.title}
            </Text>
            <Text style={[styles.libCardSub, { color: t.textMuted }]} numberOfLines={1}>
              {(libraryItem.media as AudiobookshelfBookMedia).metadata.authorName || ''}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  )
}

function CoverImage({ uri }: { uri: string }) {
  const { Image } = require('react-native')
  return <Image source={{ uri }} style={styles.cover} resizeMode="cover" />
}

const styles = {
  screen: { flex: 1 as const },
  errorBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: 6,
    gap: 6,
  },
  errorText: { flex: 1, fontSize: 13 },
  retryBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  retryText: { fontSize: 13, fontWeight: '600' as const },
  loading: { paddingVertical: 32, alignItems: 'center' as const },
  empty: { alignItems: 'center' as const, paddingVertical: 48 },
  emptyText: { marginTop: 12, fontSize: 14 },
  libraryHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  libraryTitle: { fontSize: 18, fontWeight: '700' as const },
  libraryMeta: { fontSize: 12, marginTop: 2 },
  sortRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  sortFieldText: { fontSize: 13, fontWeight: '600' as const, marginRight: 2 },
  sortArrowBtn: { padding: 4 },
  libCard: {
    flex: 1 as const,
    borderRadius: 8,
    overflow: 'hidden' as const,
    borderWidth: 1,
    padding: 8,
  },
  libCoverWrap: {
    width: '100%' as const,
    aspectRatio: 1 as const,
    borderRadius: 6,
    overflow: 'hidden' as const,
    backgroundColor: '#888',
  },
  cover: { width: '100%' as const, height: '100%' as const },
  libCardTitle: { fontSize: 13, fontWeight: '500' as const, marginTop: 6 },
  libCardSub: { fontSize: 11, marginTop: 2 },
  sortOverlay: {
    flex: 1 as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sortDropdown: {
    minWidth: 200,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden' as const,
  },
  sortOption: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  sortOptionText: { fontSize: 15 },
  searchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 12,
  },
  searchCover: { width: 48, height: 48, borderRadius: 4, overflow: 'hidden' as const, backgroundColor: '#888' },
}