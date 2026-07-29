import { useCallback, useEffect, useState, useRef } from 'react'
import { View, Text, TouchableOpacity, ScrollView, FlatList, ActivityIndicator, BackHandler, StyleSheet, Dimensions, Modal, Platform, StatusBar } from 'react-native'
import { startActivityAsync } from 'expo-intent-launcher'
import { useJellyfinStore } from '@/stores/jellyfinStore'
import { useJellyfinPlaybackStore } from '@/stores/jellyfinPlaybackStore'
import { flushQueue, startAutoFlush, stopAutoFlush } from '@/lib/api/jellyfinPlaybackQueue'
import { getCached, setCached } from '@/lib/api/jellyfinCache'
import {
  jellyfinLogin,
  jellyfinGetLibraries,
  jellyfinGetResumeItems,
  jellyfinGetLibraryItems,
  jellyfinGetSeasons,
  jellyfinGetEpisodes,
  jellyfinGetStreamUrl,
  jellyfinGetSystemInfo,
  jellyfinSearch,
} from '@/lib/api/jellyfin'
import type { ServiceConfig, JellyfinServerConfig, JellyfinLibrary, JellyfinItem, JellyfinSeason } from '@/types'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import JellyfinHeader from '@/components/jellyfin/JellyfinHeader'
import JellyfinResumeRow from '@/components/jellyfin/JellyfinResumeRow'
import JellyfinLibraryGrid from '@/components/jellyfin/JellyfinLibraryGrid'
import JellyfinItemGrid from '@/components/jellyfin/JellyfinItemGrid'
import JellyfinEpisodeList from '@/components/jellyfin/JellyfinEpisodeList'
import JellyfinItemDetail from '@/components/jellyfin/JellyfinItemDetail'
import JellyfinDrawer from '@/components/jellyfin/JellyfinDrawer'
import JellyfinPlayer from '@/components/jellyfin/JellyfinPlayer'
import JellyfinServerSettings from '@/components/jellyfin/JellyfinServerSettings'
import JellyfinPlaybackSettings from '@/components/jellyfin/JellyfinPlaybackSettings'

type ViewType = 'home' | 'items' | 'seasons' | 'episodes' | 'searchResults' | 'detail'

interface Props {
  service: ServiceConfig
  onRequestClose?: () => void
}

export default function JellyfinScreen({ service, onRequestClose }: Props) {
  const t = useTheme()
  const { server, user, libraries, resumeItems, setServer, setUser, setLibraries, setResumeItems } = useJellyfinStore()
  const prefsLoadFromStorage = useJellyfinPlaybackStore((s) => s.loadFromStorage)
  const prefs = useJellyfinPlaybackStore()

  useEffect(() => {
    void prefsLoadFromStorage()
  }, [prefsLoadFromStorage])

  useEffect(() => {
    if (!server) return
    startAutoFlush(() => server)
    void flushQueue(server)
    return () => stopAutoFlush()
  }, [server])

  const [view, setView] = useState<ViewType>('home')
  const [currentLibraryName, setCurrentLibraryName] = useState('')
  const [currentItems, setCurrentItems] = useState<JellyfinItem[]>([])
  const [currentSeasons, setCurrentSeasons] = useState<JellyfinSeason[]>([])
  const [detailItem, setDetailItem] = useState<JellyfinItem | null>(null)
  const [detailSeriesId, setDetailSeriesId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [playing, setPlaying] = useState<{ url: string; item: JellyfinItem } | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [showPlaybackSettings, setShowPlaybackSettings] = useState(false)
  const [serverVersion, setServerVersion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState('SortName')
  const [sortOrder, setSortOrder] = useState<'Ascending' | 'Descending'>('Ascending')
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [currentParentId, setCurrentParentId] = useState<string | null>(null)
  const [currentCollectionType, setCurrentCollectionType] = useState<string | undefined>(undefined)

  const SORT_OPTIONS = [
    { label: '名称', value: 'SortName', defaultDir: 'Ascending' as const },
    { label: '添加时间', value: 'DateCreated', defaultDir: 'Descending' as const },
    { label: '评分', value: 'CommunityRating', defaultDir: 'Descending' as const },
    { label: '上映时间', value: 'PremiereDate', defaultDir: 'Descending' as const },
  ]

  const loadServer = useCallback(async () => {
    if (!service.url || !service.username || !service.password) {
      setError('请先在设置中配置 Jellyfin 服务器地址和账号密码')
      return
    }
    setError(null)

    // Read cache first for instant display
    const [cachedServer, cachedLibs, cachedResume] = await Promise.all([
      getCached<JellyfinServerConfig>('serverInfo'),
      getCached<JellyfinLibrary[]>('libraries'),
      getCached<JellyfinItem[]>('resumeItems'),
    ])

    const hasCachedServer = cachedServer && cachedServer.url === service.url && cachedServer.username === service.username && cachedServer.userId && cachedServer.userName && cachedServer.accessToken
    if (hasCachedServer) {
      setServer(cachedServer)
      setUser({ Id: cachedServer.userId!, Name: cachedServer.userName! })
      if (cachedLibs) setLibraries(cachedLibs)
      if (cachedResume) setResumeItems(cachedResume)
      setLoading(false)
    } else {
      setServer(null)
      setLoading(true)
    }

    // Background login + fresh data
    const result = await jellyfinLogin(service.url, service.username, service.password)
    if (!result.ok || !result.server) {
      if (!hasCachedServer) {
        setError(result.error ?? '登录失败')
        setLoading(false)
      }
      return
    }

    setServer(result.server)
    setUser({ Id: result.server.userId!, Name: result.server.userName! })
    await setCached('serverInfo', result.server, 86400000)

    const [libs, resume, sys] = await Promise.all([
      jellyfinGetLibraries(result.server),
      jellyfinGetResumeItems(result.server),
      jellyfinGetSystemInfo(result.server),
    ])
    if (libs.ok) { setLibraries(libs.libraries ?? []); await setCached('libraries', libs.libraries ?? [], 300000) }
    if (resume.ok) { setResumeItems(resume.items ?? []); await setCached('resumeItems', resume.items ?? [], 30000) }
    if (sys.ok && sys.version) setServerVersion(sys.version)

    setLoading(false)
  }, [service, setServer, setUser, setLibraries, setResumeItems])

  useEffect(() => { loadServer() }, [])

  const viewRef = useRef(view)
  const drawerOpenRef = useRef(drawerOpen)
  const showServerSettingsRef = useRef(showServerSettings)
  const showPlaybackSettingsRef = useRef(showPlaybackSettings)
  viewRef.current = view
  drawerOpenRef.current = drawerOpen
  showServerSettingsRef.current = showServerSettings
  showPlaybackSettingsRef.current = showPlaybackSettings

  const prevViewRef = useRef<ViewType>('home')
  useEffect(() => {
    if (view !== 'detail') prevViewRef.current = view
  }, [view])

  const goBack = useCallback(() => {
    const v = viewRef.current
    if (v === 'detail') { setView(prevViewRef.current); setDetailItem(null); setDetailSeriesId(null) }
    else if (v === 'episodes') { setView('items'); setCurrentItems([]); setCurrentSeasons([]) }
    else if (v === 'seasons') { setView('items'); setCurrentSeasons([]) }
    else if (v === 'items' || v === 'searchResults') { setView('home'); setCurrentItems([]); setSearchQuery('') }
  }, [])

  // Expose a back handler that ServiceScreen can use via useFocusEffect.
  // Returns true if the event was consumed (handled internally),
  // returns false to let the navigator handle it (i.e. switch tabs).
  const handleHardwareBack = useCallback((): boolean => {
    if (drawerOpenRef.current) { setDrawerOpen(false); return true }
    if (showServerSettingsRef.current) { setShowServerSettings(false); return true }
    if (showPlaybackSettingsRef.current) { setShowPlaybackSettings(false); return true }
    const v = viewRef.current
    if (v !== 'home') {
      goBack()
      return true
    }
    if (onRequestClose) { onRequestClose(); return true }
    return false
  }, [goBack, onRequestClose])

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack)
    return () => handler.remove()
  }, [handleHardwareBack])

  const handleLibraryPress = async (lib: JellyfinLibrary) => {
    if (!server) return
    setCurrentLibraryName(lib.Name)
    setCurrentParentId(lib.ItemId)
    setCurrentCollectionType(lib.CollectionType)
    const defaultSortBy = 'SortName'
    const defaultSortOrder: 'Ascending' = 'Ascending'
    setSortBy(defaultSortBy)
    setSortOrder(defaultSortOrder)
    setView('items')
    setLoading(true)

    const cacheKey = `libItems:${lib.ItemId}`
    const cached = await getCached<JellyfinItem[]>(cacheKey)
    if (cached) { setCurrentItems(cached); setLoading(false) }

    const result = await jellyfinGetLibraryItems(server, lib.ItemId, lib.CollectionType, 50, defaultSortBy, defaultSortOrder)
    if (result.ok) { setCurrentItems(result.items ?? []); await setCached(cacheKey, result.items ?? [], 60000) }
    setLoading(false)
  }

  const handleItemPress = async (item: JellyfinItem) => {
    if (!server) return
    if (item.Type === 'Movie' || item.Type === 'Series') {
      setDetailItem(item)
      setDetailSeriesId(item.SeriesId ?? item.Id)
      setView('detail')
    } else if (item.Type === 'Episode') {
      setLoading(true)
      setError(null)
      const stream = await jellyfinGetStreamUrl(server, item.Id)
      setLoading(false)
      if (stream.ok && stream.url) {
        if (prefs.useExternalPlayer) {
          try {
            await startActivityAsync('android.intent.action.VIEW', { data: stream.url, type: 'video/*' })
          } catch (e: any) {
            setError(`外部播放器启动失败: ${e?.message ?? e}`)
          }
        } else {
          setPlaying({ url: stream.url, item })
        }
      } else {
        setError(stream.error || '无法获取播放地址')
      }
    } else if (item.Type === 'Folder') {
      setCurrentParentId(item.Id)
      setCurrentCollectionType(undefined)
      const defaultSortBy = 'SortName'
      const defaultSortOrder: 'Ascending' = 'Ascending'
      setSortBy(defaultSortBy)
      setSortOrder(defaultSortOrder)
      setCurrentLibraryName(item.Name)
      setView('items')
      setLoading(true)

      const folderCacheKey = `libItems:${item.Id}`
      const cachedItems = await getCached<JellyfinItem[]>(folderCacheKey)
      if (cachedItems) { setCurrentItems(cachedItems); setLoading(false) }

      const result = await jellyfinGetLibraryItems(server, item.Id, undefined, 50, defaultSortBy, defaultSortOrder)
      if (result.ok) { setCurrentItems(result.items ?? []); await setCached(folderCacheKey, result.items ?? [], 60000) }
      setLoading(false)
    }
  }

  const handleSortFieldChange = (value: string) => {
    if (!currentParentId || !server) return
    setSortBy(value)
    const dir = SORT_OPTIONS.find((o) => o.value === value)?.defaultDir || 'Ascending'
    setSortOrder(dir)
    setShowSortDropdown(false)
    setLoading(true)
    jellyfinGetLibraryItems(server, currentParentId, currentCollectionType, 50, value, dir).then((r) => {
      if (r.ok) setCurrentItems(r.items ?? [])
      setLoading(false)
    })
  }

  const handleToggleSortOrder = () => {
    if (!currentParentId || !server) return
    const newOrder = sortOrder === 'Ascending' ? 'Descending' : 'Ascending'
    setSortOrder(newOrder)
    setLoading(true)
    jellyfinGetLibraryItems(server, currentParentId, currentCollectionType, 50, sortBy, newOrder).then((r) => {
      if (r.ok) setCurrentItems(r.items ?? [])
      setLoading(false)
    })
  }

  const handlePlay = async (item: JellyfinItem) => {
    if (!server) return
    if (item.Type !== 'Movie' && item.Type !== 'Episode') return
    setLoading(true)
    setError(null)
    const stream = await jellyfinGetStreamUrl(server, item.Id)
    setLoading(false)
    if (stream.ok && stream.url) {
      if (prefs.useExternalPlayer) {
        try {
          await startActivityAsync('android.intent.action.VIEW', { data: stream.url, type: 'video/*' })
        } catch (e: any) {
          setError(`外部播放器启动失败: ${e?.message ?? e}`)
        }
      } else {
        setPlaying({ url: stream.url, item })
      }
    } else {
      setError(stream.error || '无法获取播放地址')
    }
  }

  const handleSeasonPress = async (seasonId: string, seasonNumber: number) => {
    if (!server || !detailSeriesId) return
    setLoading(true)

    const cacheKey = `episodes:${detailSeriesId}:${seasonId}`
    const cached = await getCached<JellyfinItem[]>(cacheKey)
    if (cached) {
      setCurrentItems(cached)
      setCurrentSeasons([{ Id: seasonId, Name: `第 ${seasonNumber} 季`, SeasonNumber: seasonNumber, SeriesId: detailSeriesId } as JellyfinSeason])
      setView('episodes')
      setLoading(false)
    }

    const result = await jellyfinGetEpisodes(server, detailSeriesId, seasonId)
    if (result.ok) {
      setCurrentItems(result.episodes ?? [])
      await setCached(cacheKey, result.episodes ?? [], 300000)
      setCurrentSeasons([{ Id: seasonId, Name: `第 ${seasonNumber} 季`, SeasonNumber: seasonNumber, SeriesId: detailSeriesId } as JellyfinSeason])
      setView('episodes')
    } else if (!cached) {
      setError(result.error || '无法获取剧集')
    }
    setLoading(false)
  }

  const handleSearch = async () => {
    if (!server || !searchQuery.trim()) return
    setLoading(true)
    const result = await jellyfinSearch(server, searchQuery.trim())
    setLoading(false)
    if (result.ok) {
      setCurrentItems(result.results ?? [])
      setView('searchResults')
    }
  }

  const handleClearSearch = () => {
    setSearchQuery('')
    if (view === 'searchResults') {
      setView('home')
      setCurrentItems([])
    }
  }

  if (!server) {
    if (loading) {
      return (
        <View style={[styles.center, { backgroundColor: t.bg }]}>
          <ActivityIndicator size="large" color={t.primary} />
          <Text style={[styles.loadingText, { color: t.textMuted }]}>正在连接 Jellyfin...</Text>
        </View>
      )
    }
    if (error) {
      return (
        <View style={[styles.center, { backgroundColor: t.bg }]}>
          <Icon name="alertCircle" size={48} color={t.primary} />
          <Text style={[styles.errorText, { color: t.text }]}>{error}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: t.primary }]} onPress={loadServer}>
            <Text style={styles.retryBtnText}>重试</Text>
          </TouchableOpacity>
        </View>
      )
    }
    // Initial mount — always show loading until loadServer sets a server
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator size="large" color={t.primary} />
        <Text style={[styles.loadingText, { color: t.textMuted }]}>正在连接 Jellyfin...</Text>
      </View>
    )
  }

  return (
    <View style={[styles.screen, { backgroundColor: t.bg }]}>
      <JellyfinHeader
        onMenuPress={() => setDrawerOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSubmitSearch={handleSearch}
        onClearSearch={handleClearSearch}
        showBack={view !== 'home'}
        onBackPress={goBack}
      />

      {error && server && (
        <View style={[styles.errorBanner, { backgroundColor: t.warning + '22' }]}>
          <Text style={[styles.errorBannerText, { color: t.warning }]}>{error}</Text>
        </View>
      )}

      {view === 'home' && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <JellyfinResumeRow server={server!} items={resumeItems} onItemPress={handleItemPress} />
          <JellyfinLibraryGrid server={server!} libraries={libraries} onLibraryPress={handleLibraryPress} />
        </ScrollView>
      )}

      {(view === 'items' || view === 'searchResults') && (
        <View style={styles.listSection}>
          <View style={styles.listTitleRow}>
            <Text style={[styles.listTitle, { color: t.text }]}>
              {view === 'searchResults' ? '搜索结果' : currentLibraryName}
            </Text>
            {view === 'items' && (
              <View style={styles.sortRow}>
                <TouchableOpacity onPress={() => setShowSortDropdown(true)} activeOpacity={0.7}>
                  <Text style={[styles.sortFieldText, { color: t.primary }]}>
                    {SORT_OPTIONS.find((o) => o.value === sortBy)?.label || '名称'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleToggleSortOrder} style={styles.sortArrowBtn}>
                  <Icon name="chevronUp" size={14} color={sortOrder === 'Ascending' ? t.primary : t.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleToggleSortOrder} style={styles.sortArrowBtn}>
                  <Icon name="chevronDown" size={14} color={sortOrder === 'Descending' ? t.primary : t.textMuted} />
                </TouchableOpacity>
              </View>
            )}
          </View>
          {loading ? (
            <ActivityIndicator size="small" color={t.primary} style={{ marginTop: 20 }} />
          ) : (
            <JellyfinItemGrid server={server!} items={currentItems} onItemPress={handleItemPress} />
          )}
        </View>
      )}
      {showSortDropdown && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowSortDropdown(false)}>
          <TouchableOpacity style={styles.sortOverlay} activeOpacity={1} onPress={() => setShowSortDropdown(false)}>
            <View style={{ marginTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 44 : 44, marginRight: 16, alignSelf: 'flex-end' }}>
              <View style={[styles.sortDropdown, { backgroundColor: t.card, borderColor: t.border }]}>
                {SORT_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.sortOption, { borderBottomColor: t.border }]}
                    onPress={() => handleSortFieldChange(opt.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.sortOptionText, { color: t.text }]}>{opt.label}</Text>
                    {sortBy === opt.value && (
                      <Icon name="check" size={14} color={t.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {view === 'episodes' && (
        <View style={styles.listSection}>
          <Text style={[styles.listTitle, { color: t.text, paddingHorizontal: 16 }]}>
            {currentSeasons[0]?.Name || '剧集'}
          </Text>
          {loading ? (
            <ActivityIndicator size="small" color={t.primary} style={{ marginTop: 20 }} />
          ) : (
            <JellyfinEpisodeList server={server!} episodes={currentItems} onEpisodePress={handleItemPress} />
          )}
        </View>
      )}

      {view === 'detail' && detailItem && server && (
        <JellyfinItemDetail
          server={server}
          item={detailItem}
          onPlay={handlePlay}
          onSeasonPress={handleSeasonPress}
          onBack={goBack}
        />
      )}

      <JellyfinDrawer
        visible={drawerOpen}
        server={server}
        serverVersion={serverVersion}
        onClose={() => setDrawerOpen(false)}
        onServerSettings={() => setShowServerSettings(true)}
        onPlaybackSettings={() => setShowPlaybackSettings(true)}
      />

        <JellyfinServerSettings visible={showServerSettings} onClose={() => setShowServerSettings(false)} />

      <JellyfinPlaybackSettings visible={showPlaybackSettings} onClose={() => setShowPlaybackSettings(false)} />

      {playing && (
        <JellyfinPlayer
          visible
          url={playing.url}
          item={playing.item}
          server={server!}
          onClose={() => setPlaying(null)}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14 },
  errorText: { marginTop: 12, fontSize: 14, textAlign: 'center' },
  retryBtn: { marginTop: 16, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 },
  retryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  errorBanner: { paddingHorizontal: 12, paddingVertical: 8 },
  errorBannerText: { fontSize: 13, textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 12, paddingBottom: 32 },
  listSection: { flex: 1 },
  listTitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  listTitle: { fontSize: 17, fontWeight: '700', marginVertical: 10 },
  sortRow: { flexDirection: 'row', alignItems: 'center' },
  sortFieldText: { fontSize: 13, fontWeight: '600', marginRight: 2 },
  sortArrowBtn: { padding: 4 },
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
  sortOptionText: { fontSize: 14, fontWeight: '500' },
  gridContent: { paddingBottom: 32 },
  gridRow: { paddingHorizontal: 8 },
  gridItem: { flex: 1, paddingHorizontal: 4 },
  emptyText: { textAlign: 'center', marginTop: 32, fontSize: 14 },
  seasonsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 12 },
  seasonCard: { },
  seasonTitle: { fontSize: 13, fontWeight: '500', marginTop: 6, textAlign: 'center' },
  episodeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  episodePoster: { width: 140, height: 79, borderRadius: 6, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  episodeInfo: { flex: 1, marginLeft: 10 },
  episodeName: { fontSize: 14, fontWeight: '500' },
  episodeMeta: { fontSize: 11, marginTop: 2 },
  episodeListContent: { paddingBottom: 32 },
})
