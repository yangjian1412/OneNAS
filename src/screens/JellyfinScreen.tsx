import { useCallback, useEffect, useState, useRef } from 'react'
import { View, Text, TouchableOpacity, ScrollView, FlatList, ActivityIndicator, BackHandler, StyleSheet, Dimensions } from 'react-native'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import { useJellyfinStore } from '@/stores/jellyfinStore'
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
import type { ServiceConfig, JellyfinLibrary, JellyfinItem, JellyfinSeason } from '@/types'
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
import JellyfinWebView from '@/components/jellyfin/JellyfinWebView'
import JellyfinPlaybackSettings from '@/components/jellyfin/JellyfinPlaybackSettings'

type ViewType = 'home' | 'items' | 'seasons' | 'episodes' | 'searchResults' | 'detail'

interface Props {
  service: ServiceConfig
}

export default function JellyfinScreen({ service }: Props) {
  const t = useTheme()
  const navigation = useNavigation<any>()
  const isFocused = useIsFocused()
  const { server, user, libraries, resumeItems, setServer, setUser, setLibraries, setResumeItems } = useJellyfinStore()

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

  const loadServer = useCallback(async () => {
    if (!service.url || !service.username || !service.password) {
      setError('请先在设置中配置 Jellyfin 服务器地址和账号密码')
      return
    }
    setServer(null)
    setLoading(true)
    setError(null)

    const result = await jellyfinLogin(service.url, service.username, service.password)
    if (!result.ok || !result.server) {
      setError(result.error ?? '登录失败')
      setLoading(false)
      return
    }

    setServer(result.server)
    setUser({ Id: result.server.userId!, Name: result.server.userName! })

    const [libs, resume, sys] = await Promise.all([
      jellyfinGetLibraries(result.server),
      jellyfinGetResumeItems(result.server),
      jellyfinGetSystemInfo(result.server),
    ])

    if (libs.ok) setLibraries(libs.libraries ?? [])
    if (resume.ok) setResumeItems(resume.items ?? [])
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
    if (!isFocused) return false
    if (drawerOpenRef.current) { setDrawerOpen(false); return true }
    if (showServerSettingsRef.current) { setShowServerSettings(false); return true }
    if (showPlaybackSettingsRef.current) { setShowPlaybackSettings(false); return true }
    const v = viewRef.current
    if (v !== 'home') {
      goBack()
      return true
    }
    navigation.navigate('Files')
    return true
  }, [goBack, isFocused, navigation])

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack)
    return () => handler.remove()
  }, [handleHardwareBack])

  const handleLibraryPress = async (lib: JellyfinLibrary) => {
    if (!server) return
    setLoading(true)
    const result = await jellyfinGetLibraryItems(server, lib.ItemId, lib.CollectionType)
    if (result.ok) setCurrentItems(result.items ?? [])
    setLoading(false)
    setCurrentLibraryName(lib.Name)
    setView('items')
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
        setPlaying({ url: stream.url, item })
      } else {
        setError(stream.error || '无法获取播放地址')
      }
    } else if (item.Type === 'Folder') {
      setLoading(true)
      const result = await jellyfinGetLibraryItems(server, item.Id, undefined)
      setLoading(false)
      if (result.ok) {
        setCurrentItems(result.items ?? [])
        setCurrentLibraryName(item.Name)
        setView('items')
      } else {
        setError(result.error || '无法加载文件夹')
      }
    }
  }

  const handlePlay = async (item: JellyfinItem) => {
    if (!server) return
    if (item.Type !== 'Movie' && item.Type !== 'Episode') return
    setLoading(true)
    setError(null)
    const stream = await jellyfinGetStreamUrl(server, item.Id)
    setLoading(false)
    if (stream.ok && stream.url) {
      setPlaying({ url: stream.url, item })
    } else {
      setError(stream.error || '无法获取播放地址')
    }
  }

  const handleSeasonPress = async (seasonId: string, seasonNumber: number) => {
    if (!server || !detailSeriesId) return
    setLoading(true)
    const result = await jellyfinGetEpisodes(server, detailSeriesId, seasonId)
    setLoading(false)
    if (result.ok) {
      setCurrentItems(result.episodes ?? [])
      setCurrentSeasons([{ Id: seasonId, Name: `第 ${seasonNumber} 季`, SeasonNumber: seasonNumber, SeriesId: detailSeriesId } as JellyfinSeason])
      setView('episodes')
    } else {
      setError(result.error || '无法获取剧集')
    }
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

  if (loading && !server) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator size="large" color={t.primary} />
        <Text style={[styles.loadingText, { color: t.textMuted }]}>正在连接 Jellyfin...</Text>
      </View>
    )
  }

  if (error && !server) {
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
          <Text style={[styles.listTitle, { color: t.text, paddingHorizontal: 16 }]}>
            {view === 'searchResults' ? '搜索结果' : currentLibraryName}
          </Text>
          {loading ? (
            <ActivityIndicator size="small" color={t.primary} style={{ marginTop: 20 }} />
          ) : (
            <JellyfinItemGrid server={server!} items={currentItems} onItemPress={handleItemPress} />
          )}
        </View>
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

      {server?.url && (
        <JellyfinWebView url={server.url} visible={showServerSettings} onClose={() => setShowServerSettings(false)} />
      )}

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
  listTitle: { fontSize: 17, fontWeight: '700', marginVertical: 10 },
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
