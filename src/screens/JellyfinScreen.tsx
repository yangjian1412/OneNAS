import { useCallback, useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, FlatList, ActivityIndicator, BackHandler, StyleSheet } from 'react-native'
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
import JellyfinItemCard from '@/components/jellyfin/JellyfinItemCard'
import JellyfinPoster from '@/components/jellyfin/JellyfinPoster'
import JellyfinDrawer from '@/components/jellyfin/JellyfinDrawer'
import JellyfinPlayer from '@/components/jellyfin/JellyfinPlayer'

type ViewType = 'home' | 'items' | 'seasons' | 'episodes' | 'searchResults'

interface Props {
  service: ServiceConfig
}

export default function JellyfinScreen({ service }: Props) {
  const t = useTheme()
  const { server, user, libraries, resumeItems, setServer, setUser, setLibraries, setResumeItems } = useJellyfinStore()

  const [view, setView] = useState<ViewType>('home')
  const [currentLibraryName, setCurrentLibraryName] = useState('')
  const [currentItems, setCurrentItems] = useState<JellyfinItem[]>([])
  const [currentSeasons, setCurrentSeasons] = useState<JellyfinSeason[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [playing, setPlaying] = useState<{ url: string; item: JellyfinItem } | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
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

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (drawerOpen) { setDrawerOpen(false); return true }
      if (view !== 'home') { goBack(); return true }
      return true
    })
    return () => handler.remove()
  }, [view, drawerOpen])

  const goBack = () => {
    if (view === 'episodes') { setView('seasons'); setCurrentItems([]) }
    else if (view === 'seasons') { setView('items'); setCurrentSeasons([]) }
    else if (view === 'items' || view === 'searchResults') { setView('home'); setCurrentItems([]); setSearchQuery('') }
  }

  const handleLibraryPress = async (lib: JellyfinLibrary) => {
    if (!server) return
    setLoading(true)
    const result = await jellyfinGetLibraryItems(server, lib.ItemId)
    if (result.ok) setCurrentItems(result.items ?? [])
    setLoading(false)
    setCurrentLibraryName(lib.Name)
    setView('items')
  }

  const handleItemPress = async (item: JellyfinItem) => {
    if (!server) return
    if (item.Type === 'Movie' || item.Type === 'Episode') {
      setLoading(true)
      setError(null)
      const stream = await jellyfinGetStreamUrl(server, item.Id)
      setLoading(false)
      if (stream.ok && stream.url) {
        setPlaying({ url: stream.url, item })
      } else {
        setError(stream.error || '无法获取播放地址')
      }
    } else if (item.Type === 'Series') {
      setLoading(true)
      setError(null)
      const seasons = await jellyfinGetSeasons(server, item.Id)
      setLoading(false)
      if (seasons.ok) {
        setCurrentSeasons(seasons.seasons ?? [])
        setView('seasons')
      } else {
        setError(seasons.error || '无法获取剧集信息')
      }
    }
  }

  const handleSeasonPress = async (season: JellyfinSeason) => {
    if (!server) return
    setLoading(true)
    const episodes = await jellyfinGetEpisodes(server, season.SeriesId, season.Id)
    setLoading(false)
    if (episodes.ok) {
      setCurrentItems(episodes.episodes ?? [])
      setView('episodes')
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

  const renderItem = ({ item }: { item: JellyfinItem }) => (
    <View style={styles.gridItem}>
      <JellyfinItemCard server={server!} item={item} direction="vertical" onPress={() => handleItemPress(item)} />
    </View>
  )

  const renderSeasonItem = (season: JellyfinSeason) => (
    <TouchableOpacity
      key={season.Id}
      style={[styles.seasonRow, { borderBottomColor: t.border }]}
      onPress={() => handleSeasonPress(season)}
    >
      <View style={[styles.seasonPoster, { backgroundColor: t.border }]}>
        <Icon name="film" size={20} color={t.textMuted} />
      </View>
      <View style={styles.seasonInfo}>
        <Text style={[styles.seasonName, { color: t.text }]}>{season.Name}</Text>
        <Text style={[styles.seasonMeta, { color: t.textMuted }]}>第 {season.SeasonNumber} 季</Text>
      </View>
      <Icon name="chevronRight" size={18} color={t.textMuted} />
    </TouchableOpacity>
  )

  return (
    <View style={[styles.screen, { backgroundColor: t.bg }]}>
      <JellyfinHeader
        onMenuPress={() => setDrawerOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSubmitSearch={handleSearch}
        onClearSearch={handleClearSearch}
        showBack={view !== 'home'}
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
          <Text style={[styles.listTitle, { color: t.text, paddingHorizontal: 12 }]}>
            {view === 'searchResults' ? '搜索结果' : currentLibraryName}
          </Text>
          {loading ? (
            <ActivityIndicator size="small" color={t.primary} style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              key={`grid-${view}`}
              data={currentItems}
              numColumns={2}
              renderItem={renderItem}
              keyExtractor={(item) => item.Id}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.gridContent}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: t.textMuted }]}>暂无内容</Text>
              }
            />
          )}
        </View>
      )}

      {view === 'seasons' && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {loading ? (
            <ActivityIndicator size="small" color={t.primary} style={{ marginTop: 20 }} />
          ) : (
            currentSeasons.length > 0 ? (
              currentSeasons
                .filter((s) => s.SeasonNumber !== null)
                .sort((a, b) => (a.SeasonNumber ?? 0) - (b.SeasonNumber ?? 0))
                .map(renderSeasonItem)
            ) : (
              <Text style={[styles.emptyText, { color: t.textMuted }]}>暂无季</Text>
            )
          )}
        </ScrollView>
      )}

      {view === 'episodes' && (
        <View style={styles.listSection}>
          {loading ? (
            <ActivityIndicator size="small" color={t.primary} style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={currentItems}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.episodeRow, { borderBottomColor: t.border }]}
                  onPress={() => handleItemPress(item)}
                >
                  <View style={[styles.episodePoster, { backgroundColor: t.border }]}>
                    <JellyfinPoster server={server!} itemId={item.Id} imageTags={item.ImageTags} backdropTag={item.BackdropImageTags?.[0]} size="small" />
                  </View>
                  <View style={styles.episodeInfo}>
                    <Text style={[styles.episodeName, { color: t.text }]} numberOfLines={1}>{item.Name}</Text>
                    <Text style={[styles.episodeMeta, { color: t.textMuted }]}>
                      {item.IndexNumber != null ? `第 ${item.IndexNumber} 集` : ''}
                      {item.Overview ? ` · ${item.Overview.slice(0, 60)}${item.Overview.length > 60 ? '...' : ''}` : ''}
                    </Text>
                  </View>
                  <Icon name="playCircle" size={28} color={t.primary} />
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.Id}
              contentContainerStyle={styles.episodeListContent}
            />
          )}
        </View>
      )}

      <JellyfinDrawer
        visible={drawerOpen}
        server={server}
        serverVersion={serverVersion}
        onClose={() => setDrawerOpen(false)}
      />

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
  seasonRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12 },
  seasonPoster: { width: 40, height: 40, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  seasonInfo: { flex: 1, marginLeft: 12 },
  seasonName: { fontSize: 15, fontWeight: '500' },
  seasonMeta: { fontSize: 12, marginTop: 2 },
  episodeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  episodePoster: { width: 100, height: 56, borderRadius: 6, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  episodeInfo: { flex: 1, marginLeft: 10 },
  episodeName: { fontSize: 14, fontWeight: '500' },
  episodeMeta: { fontSize: 11, marginTop: 2 },
  episodeListContent: { paddingBottom: 32 },
})
