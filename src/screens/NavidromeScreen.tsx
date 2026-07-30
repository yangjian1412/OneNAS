import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { View, Text, ScrollView, FlatList, TouchableOpacity, ActivityIndicator, BackHandler, Modal, StyleSheet } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useNavidromeStore, loadNavidromeHome } from '@/stores/navidromeStore'
import { useNavidromePlaybackStore } from '@/stores/navidromePlaybackStore'
import {
  navidromeLogin,
  navidromeGetAlbum, navidromeGetAlbums,
  navidromeGetPlaylist,
  navidromeGetMusicDirectory,
  navidromeGetRandomSongs,
  navidromeGetStarred,
  navidromeSearch,
  navidromeStar,
  navidromeUnstar,
  navidromeGetArtist,
  navidromeGetCoverArtUrl,
} from '@/lib/api/navidrome'
import { getCached, setCached } from '@/lib/api/navidromeCache'
import type { ServiceConfig, NavidromeServerConfig, NavidromeAlbum, NavidromeArtist, NavidromePlaylist, NavidromeSong, NavidromeDirectory } from '@/types'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import NavidromeHeader from '@/components/navidrome/NavidromeHeader'
import { NavidromeAlbumGrid, NavidromeArtistGrid, NavidromePlaylistGrid } from '@/components/navidrome/NavidromeAlbumGrid'
import NavidromeSongList from '@/components/navidrome/NavidromeSongList'
import NavidromeDrawer from '@/components/navidrome/NavidromeDrawer'
import NavidromeSettings from '@/components/navidrome/NavidromeSettings'
import NavidromeServerSettings from '@/components/navidrome/NavidromeServerSettings'
import NavidromePlayer, { NavidromePlayerBar } from '@/components/navidrome/NavidromePlayer'

type ViewType = 'home' | 'albumDetail' | 'artistAlbums' | 'allAlbums' | 'allArtists' | 'playlistDetail' | 'search' | 'directory' | 'starred' | 'random'

interface Props {
  service: ServiceConfig
  onRequestClose?: () => void
}

interface RandomData {
  songs: NavidromeSong[]
  index: number
}

interface SearchData {
  artists: NavidromeArtist[]
  albums: NavidromeAlbum[]
  songs: NavidromeSong[]
}

export default function NavidromeScreen({ service, onRequestClose }: Props) {
  const t = useTheme()
  const {
    server, artists,
    recentAlbums, freshAlbums, mostPlayed,
    playlists, starredAlbums, starredArtists, starredSongs,
    setServer, setArtists,
    setRecentAlbums, setFreshAlbums, setMostPlayed,
    setPlaylists, setStarredAlbums, setStarredArtists, setStarredSongs,
  } = useNavidromeStore()
  const prefs = useNavidromePlaybackStore()
  const prefsLoad = useNavidromePlaybackStore((s) => s.loadFromStorage)

  const isFocused = useIsFocused()

  const [view, setView] = useState<ViewType>('home')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [serverVersion, setServerVersion] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [commonSettingsOpen, setCommonSettingsOpen] = useState(false)
  const [lyricsSettingsOpen, setLyricsSettingsOpen] = useState(false)
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false)

  // Album detail
  const [albumDetail, setAlbumDetail] = useState<NavidromeAlbum | null>(null)
  const [albumSongs, setAlbumSongs] = useState<NavidromeSong[]>([])

  // Artist albums
  const [artistDetail, setArtistDetail] = useState<NavidromeArtist | null>(null)
  const [artistAlbums, setArtistAlbums] = useState<NavidromeAlbum[]>([])

  // Playlist detail
  const [playlistDetail, setPlaylistDetail] = useState<NavidromePlaylist | null>(null)
  const [playlistSongs, setPlaylistSongs] = useState<NavidromeSong[]>([])

  // View stack for back navigation
  const viewStackRef = useRef<ViewType[]>([])
  const currentViewRef = useRef<ViewType>(view)
  currentViewRef.current = view

  // Directory
  const [directory, setDirectory] = useState<NavidromeDirectory | null>(null)
  const [directoryStack, setDirectoryStack] = useState<string[]>([])

  // All albums (for "查看全部")
  const [allAlbums, setAllAlbums] = useState<NavidromeAlbum[]>([])
  const [albumSortBy, setAlbumSortBy] = useState<'name' | 'artist' | 'created'>('created')
  const [albumSortDir, setAlbumSortDir] = useState<'asc' | 'desc'>('desc')
  const [showAlbumSort, setShowAlbumSort] = useState(false)

  // All artists sort
  const [artistSortDir, setArtistSortDir] = useState<'asc' | 'desc'>('asc')
  const [showArtistSort, setShowArtistSort] = useState(false)

  // Search
  const [searchData, setSearchData] = useState<SearchData>({ artists: [], albums: [], songs: [] })

  // Random
  const [random, setRandom] = useState<RandomData>({ songs: [], index: -1 })

  const homeGridAlbums = useMemo(() => {
    if (!freshAlbums.length) return []
    const copy = [...freshAlbums]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy.slice(0, 6)
  }, [freshAlbums])

  const sortedArtists = useMemo(() => {
    if (!artists.length) return artists
    const copy = [...artists]
    copy.sort((a, b) => artistSortDir === 'asc'
      ? a.name.localeCompare(b.name)
      : b.name.localeCompare(a.name))
    return copy
  }, [artists, artistSortDir])

  useEffect(() => { void prefsLoad() }, [prefsLoad])

  const serverRef = useRef(server)
  serverRef.current = server
  const loadingRef = useRef(loading)
  loadingRef.current = loading

  const loadHome = useCallback(async () => {
    try {
      if (!service.url || !service.username || !service.password) {
        setError('请先在设置中配置 Navidrome 服务器地址和账号密码')
        setLoading(false)
        return
      }
      setError(null)
      if (!serverRef.current) setLoading(true)
      const loginResult = await navidromeLogin(service.url, service.username, service.password)
      if (!loginResult.ok || !loginResult.server) {
        setError(loginResult.error ?? '登录失败')
        setLoading(false)
        return
      }
      setServer(loginResult.server)
      setServerVersion(loginResult.serverVersion ?? '')
      await setCached('serverInfo', loginResult.server, 86400000)
      const home = await loadNavidromeHome(loginResult.server)
      setArtists(home.artists)
      setRecentAlbums(home.recentAlbums)
      setFreshAlbums(home.freshAlbums)
      setMostPlayed(home.mostPlayed)
      setPlaylists(home.playlists)
      setStarredAlbums(home.starredAlbums)
      setStarredArtists(home.starredArtists)
      setStarredSongs(home.starredSongs)
    } catch (e: any) {
      setError(e?.message ?? '加载失败')
    } finally {
      setLoading(false)
    }
  }, [service, setServer, setArtists, setRecentAlbums, setFreshAlbums, setMostPlayed, setPlaylists, setStarredAlbums, setStarredArtists, setStarredSongs])

  useEffect(() => { if (isFocused) void loadHome() }, [isFocused, loadHome])

  const goBack = useCallback(() => {
    // Directory back: pop stack and re-fetch parent
    if (view === 'directory' && directoryStack.length > 0 && server) {
      const newStack = [...directoryStack]
      const parentId = newStack.pop()!
      setDirectoryStack(newStack)
      setLoading(true)
      setError(null)
      navidromeGetMusicDirectory(server, parentId).then(result => {
        setLoading(false)
        if (result.ok && result.directory) {
          setDirectory(result.directory)
        } else {
          setError(result.error ?? '无法返回上级')
        }
      })
      return
    }
    // View stack back
    if (viewStackRef.current.length > 0) {
      const prev = viewStackRef.current.pop()!
      setView(prev)
      return
    }
    // Reset and go home
    setAlbumDetail(null)
    setAlbumSongs([])
    setArtistDetail(null)
    setArtistAlbums([])
    setPlaylistDetail(null)
    setPlaylistSongs([])
    setDirectory(null)
    setDirectoryStack([])
    setAllAlbums([])
    setSearchQuery('')
    setSearchData({ artists: [], albums: [], songs: [] })
    setRandom({ songs: [], index: -1 })
    setView('home')
  }, [view, directoryStack, server])

  const drawRef = useRef(drawerOpen)
  const commRef = useRef(commonSettingsOpen)
  const lyriRef = useRef(lyricsSettingsOpen)
  const servRef = useRef(serverSettingsOpen)
  drawRef.current = drawerOpen
  commRef.current = commonSettingsOpen
  lyriRef.current = lyricsSettingsOpen
  servRef.current = serverSettingsOpen

  const handleHardwareBack = useCallback((): boolean => {
    if (loadingRef.current) { return true }
    if (drawRef.current) { setDrawerOpen(false); return true }
    if (commRef.current) { setCommonSettingsOpen(false); return true }
    if (lyriRef.current) { setLyricsSettingsOpen(false); return true }
    if (servRef.current) { setServerSettingsOpen(false); return true }
    if (viewStackRef.current.length > 0 || view !== 'home') { goBack(); return true }
    if (onRequestClose) { onRequestClose(); return true }
    return false
  }, [view, goBack, onRequestClose])

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack)
    return () => handler.remove()
  }, [handleHardwareBack])

  const handleAlbumPress = async (album: NavidromeAlbum) => {
    if (!server) return
    setLoading(true)
    const result = await navidromeGetAlbum(server, album.id)
    setLoading(false)
    if (result.ok && result.album) {
      setAlbumDetail(result.album)
      setAlbumSongs((result.songs as any as NavidromeSong[]) ?? [])
      viewStackRef.current.push(currentViewRef.current)
      setView('albumDetail')
    } else {
      setError(result.error ?? '无法加载专辑')
    }
  }

  const handleArtistPress = async (artist: NavidromeArtist) => {
    if (!server) return
    setLoading(true)
    const result = await navidromeGetArtist(server, artist.id)
    setLoading(false)
    if (result.ok) {
      setArtistDetail(result.artist ?? artist)
      setArtistAlbums(result.albums ?? [])
      viewStackRef.current.push(currentViewRef.current)
      setView('artistAlbums')
    }
  }

  const handlePlaylistPress = async (playlist: NavidromePlaylist) => {
    if (!server) return
    try {
      setLoading(true)
      const result = await navidromeGetPlaylist(server, playlist.id)
      setLoading(false)
      if (result.ok) {
        setPlaylistDetail(result.playlist ?? playlist)
        setPlaylistSongs(result.songs ?? [])
        viewStackRef.current.push(currentViewRef.current)
        setView('playlistDetail')
      } else {
        setError(result.error ?? '无法加载播放列表')
      }
    } catch (e: any) {
      setLoading(false)
      setError(e?.message ?? '播放列表加载失败')
    }
  }

  const handleFolderPress = async (folder: NavidromeDirectory) => {
    if (!server) return
    setLoading(true)
    setError(null)
    // Push to view stack only when entering directory from a different view
    if (view !== 'directory') {
      viewStackRef.current.push(currentViewRef.current)
    }
    // Save current directory to stack for back navigation within directories
    if (view === 'directory' && directory) {
      setDirectoryStack(prev => [...prev, directory.id])
    }
    const result = await navidromeGetMusicDirectory(server, folder.id)
    setLoading(false)
    if (result.ok && result.directory) {
      setDirectory(result.directory)
      setView('directory')
    } else {
      setError(result.error ?? '无法打开文件夹')
    }
  }

  const handleSearch = async () => {
    if (!server || !searchQuery.trim()) return
    setLoading(true)
    const result = await navidromeSearch(server, searchQuery.trim())
    setLoading(false)
    if (result.ok) {
      setSearchData({
        artists: result.artists ?? [],
        albums: result.albums ?? [],
        songs: result.songs ?? [],
      })
      viewStackRef.current.push(currentViewRef.current)
      setView('search')
    }
  }

  const handleSeeAllAlbums = useCallback(async (sortBy?: string, sortDir?: string) => {
    if (!server) return
    const sBy = sortBy ?? albumSortBy
    const sDir = sortDir ?? albumSortDir
    setLoading(true)
    const type = ALBUM_SORT_TYPE[sBy] ?? 'newest'
    const result = await navidromeGetAlbums(server, { type, size: 200, offset: 0 })
    setLoading(false)
    if (result.ok) {
      let items = result.items ?? []
      if (sDir === 'desc') {
        if (sBy === 'name') {
          items = [...items].sort((a, b) => (b.name ?? '').localeCompare(a.name ?? ''))
        } else if (sBy === 'artist') {
          items = [...items].sort((a, b) => (b.artist ?? '').localeCompare(a.artist ?? ''))
        } else if (sBy === 'created') {
          items = [...items].reverse()
        }
      }
      setAllAlbums(items)
      viewStackRef.current.push(currentViewRef.current)
      setView('allAlbums')
    }
  }, [server, albumSortBy, albumSortDir])

  const handleStarToggle = useCallback(async (id: string, type: 'song' | 'album' | 'artist', currentlyStarred?: boolean) => {
    if (!server) return
    const opts = type === 'song' ? { id } : type === 'album' ? { albumId: id } : { artistId: id }
    if (currentlyStarred) await navidromeUnstar(server, opts)
    else await navidromeStar(server, opts)
  }, [server])

  const handlePlaySong = (songs: NavidromeSong[], index: number) => {
    setRandom({ songs, index })
  }

  const playAlbum = (album: NavidromeAlbum, songs: NavidromeSong[]) => {
    if (songs.length === 0) return
    handlePlaySong(songs, 0)
  }

  if (!server) {
    if (loading) {
      return (
        <View style={[styles.center, { backgroundColor: t.bg }]}>
          <ActivityIndicator size="large" color={t.primary} />
          <Text style={[styles.loadingText, { color: t.textMuted }]}>正在连接 Navidrome...</Text>
        </View>
      )
    }
    if (error) {
      return (
        <View style={[styles.center, { backgroundColor: t.bg }]}>
          <Icon name="alertCircle" size={48} color={t.primary} />
          <Text style={[styles.errorText, { color: t.text }]}>{error}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: t.primary }]} onPress={loadHome}>
            <Text style={styles.retryBtnText}>重试</Text>
          </TouchableOpacity>
        </View>
      )
    }
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator size="large" color={t.primary} />
        <Text style={[styles.loadingText, { color: t.textMuted }]}>正在连接 Navidrome...</Text>
      </View>
    )
  }

  const showBack = view !== 'home'

  return (
    <View style={[styles.screen, { backgroundColor: t.bg }]}>
      <NavidromeHeader
        onMenuPress={() => setDrawerOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSubmitSearch={handleSearch}
        onClearSearch={() => { setSearchQuery(''); if (view === 'search') setView('home') }}
        showBack={showBack}
        onBackPress={goBack}
      />

      {error && (
        <View style={[styles.errorBanner, { backgroundColor: t.warning + '22' }]}>
          <Text style={[styles.errorBannerText, { color: t.warning }]}>{error}</Text>
        </View>
      )}

      {view === 'home' && !loading && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {prefs.showRecentAlbums && recentAlbums.length > 0 && (
            <HomeSection server={server} title="最近播放" icon="clock">
              <AlbumRow server={server} albums={recentAlbums} onPress={handleAlbumPress} />
            </HomeSection>
          )}
          {prefs.showMostPlayed && mostPlayed.length > 0 && (
            <HomeSection server={server} title="最常播放" icon="trendingUp">
              <AlbumRow server={server} albums={mostPlayed} onPress={handleAlbumPress} />
            </HomeSection>
          )}
          {prefs.showFreshAlbums && freshAlbums.length > 0 && (
            <HomeSection server={server} title="最近添加" icon="plus">
              <AlbumRow server={server} albums={freshAlbums} onPress={handleAlbumPress} />
            </HomeSection>
          )}
          <HomeSection server={server} title="专辑" icon="grid" onSeeAll={handleSeeAllAlbums}>
            {homeGridAlbums.length > 0 && (
              <NavidromeAlbumGrid server={server} albums={homeGridAlbums} onAlbumPress={handleAlbumPress} emptyText="" />
            )}
          </HomeSection>
          <HomeSection server={server} title="艺术家" icon="person" onSeeAll={() => { viewStackRef.current.push(currentViewRef.current); setView('allArtists') }}>
            {artists.length > 0 ? (
              <NavidromeArtistGrid server={server} artists={artists.slice(0, 6)} onArtistPress={handleArtistPress} emptyText="" />
            ) : starredArtists.length > 0 ? (
              <NavidromeArtistGrid server={server} artists={starredArtists.slice(0, 6)} onArtistPress={handleArtistPress} emptyText="" />
            ) : null}
          </HomeSection>
          <HomeSection server={server} title="收藏" icon="star" onSeeAll={() => { viewStackRef.current.push(currentViewRef.current); setView('starred') }}>
            {starredAlbums.length > 0 ? (
              <NavidromeAlbumGrid server={server} albums={starredAlbums.slice(0, 6)} onAlbumPress={handleAlbumPress} emptyText="" />
            ) : (
              <Text style={[styles.emptyHint, { color: t.textMuted, marginVertical: 8 }]}>暂无收藏</Text>
            )}
          </HomeSection>

          {prefs.showPlaylists && playlists.length > 0 && (
            <HomeSection server={server} title="播放列表" icon="listMusic">
              <PlaylistList server={server} playlists={playlists} onPress={handlePlaylistPress} />
            </HomeSection>
          )}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {view === 'home' && loading && (
        <View style={styles.center}><ActivityIndicator size="large" color={t.primary} /></View>
      )}

      {view === 'albumDetail' && albumDetail && (
        <ScrollView contentContainerStyle={styles.detailContent}>
          <AlbumHeader
            server={server} album={albumDetail} songs={albumSongs}
            onPlay={() => playAlbum(albumDetail, albumSongs)}
            onStarToggle={async (starred) => {
              await handleStarToggle(albumDetail.id, 'album', starred)
              setAlbumDetail({ ...albumDetail, starred: starred ? undefined : new Date().toISOString() })
            }}
          />
          <View style={{ height: 12 }} />
          <NavidromeSongList songs={albumSongs} onSongPress={(_, i) => playAlbum(albumDetail, albumSongs.slice(i))} emptyText="暂无曲目" />
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {view === 'artistAlbums' && artistDetail && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ArtistHeader server={server} artist={artistDetail} />
          <View style={{ height: 12 }} />
          <Text style={[styles.sectionTitle, { color: t.text, paddingHorizontal: 16 }]}>专辑</Text>
          {artistAlbums.length > 0 ? (
            <NavidromeAlbumGrid server={server} albums={artistAlbums} onAlbumPress={handleAlbumPress} emptyText="" />
          ) : (
            <Text style={[styles.emptyHint, { color: t.textMuted }]}>暂无专辑</Text>
          )}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {view === 'playlistDetail' && playlistDetail && (
        <FlatList
          data={playlistSongs}
          keyExtractor={(item, i) => item.id ?? item.title ?? String(i)}
          ListHeaderComponent={<PlaylistHeader server={server} playlist={playlistDetail} onPlay={() => playAlbum({} as NavidromeAlbum, playlistSongs)} />}
          ListFooterComponent={<View style={{ height: 80 }} />}
          renderItem={({ item, index }) => {
            const song = item as NavidromeSong
            return (
              <TouchableOpacity
                style={[styles.songRow, { borderBottomColor: t.border }]}
                activeOpacity={0.7}
                onPress={() => playAlbum({} as NavidromeAlbum, playlistSongs.slice(index))}
              >
                <View style={{ width: 36, height: 36, borderRadius: 4, marginRight: 8, backgroundColor: t.border, overflow: 'hidden' }}>
                  <UriImage uri={navidromeGetCoverArtUrl(server, song.coverArt, 80)} />
                </View>
                <View style={[styles.songTrack, { backgroundColor: t.card }]}>
                  {song.track != null ? (
                    <Text style={[styles.songTrackText, { color: t.textMuted }]}>{song.track.toString().padStart(2, '0')}</Text>
                  ) : (
                    <Icon name="music" size={14} color={t.textMuted} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.songTitle, { color: t.text }]} numberOfLines={1}>{song.title}</Text>
                  <Text style={[styles.songArtist, { color: t.textMuted }]} numberOfLines={1}>{song.artist ?? '未知艺术家'}</Text>
                </View>
                {song.playCount != null && song.playCount > 0 ? (
                  <Text style={[styles.songCount, { color: t.warning }]}>▶ {song.playCount}</Text>
                ) : null}
                <Text style={[styles.songDuration, { color: t.textMuted }]}>{(song.duration ? Math.round(song.duration) : 0) + 's'}</Text>
              </TouchableOpacity>
            )
          }}
          ListEmptyComponent={<Text style={[styles.emptyHint, { color: t.textMuted }]}>暂无曲目</Text>}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
        />
      )}

      {view === 'search' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {searchData.artists.length > 0 && (
            <View>
              <Text style={[styles.sectionTitle, { color: t.text, paddingHorizontal: 16 }]}>艺术家</Text>
              <NavidromeArtistGrid server={server} artists={searchData.artists} onArtistPress={handleArtistPress} emptyText="" />
            </View>
          )}
          {searchData.albums.length > 0 && (
            <View>
              <Text style={[styles.sectionTitle, { color: t.text, paddingHorizontal: 16, marginTop: 16 }]}>专辑</Text>
              <NavidromeAlbumGrid server={server} albums={searchData.albums} onAlbumPress={handleAlbumPress} emptyText="" />
            </View>
          )}
          {searchData.songs.length > 0 && (
            <View>
              <Text style={[styles.sectionTitle, { color: t.text, paddingHorizontal: 16, marginTop: 16 }]}>歌曲</Text>
              <NavidromeSongList songs={searchData.songs} onSongPress={(_, i) => playAlbum({} as any, searchData.songs.slice(i))} emptyText="" />
            </View>
          )}
          {searchData.artists.length === 0 && searchData.albums.length === 0 && searchData.songs.length === 0 && (
            <Text style={[styles.emptyHint, { color: t.textMuted }]}>无搜索结果</Text>
          )}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {view === 'allAlbums' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={[styles.sortRow, { paddingHorizontal: 16 }]}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>全部专辑</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TouchableOpacity onPress={() => setShowAlbumSort(true)} activeOpacity={0.7}>
                <Text style={[styles.sortFieldText, { color: t.primary }]}>
                  {ALBUM_SORT_OPTIONS.find((o) => o.value === albumSortBy)?.label}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                setAlbumSortDir('asc')
                handleSeeAllAlbums(albumSortBy, 'asc')
              }} style={styles.sortArrowBtn}>
                <Icon name="chevronUp" size={14} color={albumSortDir === 'asc' ? t.primary : t.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                setAlbumSortDir('desc')
                handleSeeAllAlbums(albumSortBy, 'desc')
              }} style={styles.sortArrowBtn}>
                <Icon name="chevronDown" size={14} color={albumSortDir === 'desc' ? t.primary : t.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
          <NavidromeAlbumGrid server={server} albums={allAlbums} onAlbumPress={handleAlbumPress} emptyText="暂无专辑" />
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {showAlbumSort && (
        <SortModal
          options={ALBUM_SORT_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          selected={albumSortBy}
          onSelect={(value) => {
            const dir = value === albumSortBy ? (albumSortDir === 'asc' ? 'desc' : 'asc') : 'desc'
            setAlbumSortBy(value as 'name' | 'artist' | 'created')
            setAlbumSortDir(dir)
            setShowAlbumSort(false)
            handleSeeAllAlbums(value, dir)
          }}
          onClose={() => setShowAlbumSort(false)}
        />
      )}

      {view === 'allArtists' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={[styles.sortRow, { paddingHorizontal: 16 }]}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>全部艺术家</Text>
            <TouchableOpacity onPress={() => {
              const newDir = artistSortDir === 'asc' ? 'desc' : 'asc'
              setArtistSortDir(newDir)
            }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 6 }}>
              <Icon name={artistSortDir === 'asc' ? 'chevronUp' : 'chevronDown'} size={14} color={t.primary} />
              <Text style={[styles.sortFieldText, { color: t.primary }]}>名称</Text>
            </TouchableOpacity>
          </View>
          <NavidromeArtistGrid server={server} artists={sortedArtists} onArtistPress={handleArtistPress} emptyText="暂无艺术家" />
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {view === 'starred' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.sectionTitle, { color: t.text, paddingHorizontal: 16 }]}>收藏的专辑</Text>
          <NavidromeAlbumGrid server={server} albums={starredAlbums} onAlbumPress={handleAlbumPress} emptyText="" />
          <Text style={[styles.sectionTitle, { color: t.text, paddingHorizontal: 16, marginTop: 16 }]}>收藏的艺术家</Text>
          <NavidromeArtistGrid server={server} artists={starredArtists} onArtistPress={handleArtistPress} emptyText="" />
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {view === 'directory' && directory && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.sectionTitle, { color: t.text, paddingHorizontal: 16 }]}>{directory.title ?? directory.name}</Text>
          {((directory as any).child as any[] ?? []).length > 0 ? (
            <View style={{ paddingHorizontal: 16 }}>
              {((directory as any).child as any[]).map((item: any) => {
                if (item.isDir) {
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.dirItem, { borderBottomColor: t.border }]}
                      onPress={() => handleFolderPress(item)}
                    >
                      <Icon name="folderEmpty" size={20} color={t.primary} />
                      <Text style={[styles.dirItemText, { color: t.text }]} numberOfLines={1}>{item.title ?? item.name}</Text>
                    </TouchableOpacity>
                  )
                }
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.dirItem, { borderBottomColor: t.border }]}
                    onPress={() => handlePlaySong([item as NavidromeSong], 0)}
                  >
                    <Icon name="music" size={18} color={t.textMuted} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.dirItemText, { color: t.text }]} numberOfLines={1}>{item.title}</Text>
                      {item.artist ? <Text style={[styles.dirMeta, { color: t.textMuted }]}>{item.artist}</Text> : null}
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          ) : (
            <Text style={[styles.emptyHint, { color: t.textMuted }]}>此目录为空</Text>
          )}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      <NavidromeDrawer
        visible={drawerOpen}
        server={server}
        serverVersion={serverVersion}
        onClose={() => setDrawerOpen(false)}
        onCommonSettings={() => setCommonSettingsOpen(true)}
        onLyricsSettings={() => setLyricsSettingsOpen(true)}
      />
      <NavidromeSettings visible={commonSettingsOpen} onClose={() => setCommonSettingsOpen(false)} showLyrics={false} />
      <NavidromeSettings visible={lyricsSettingsOpen} onClose={() => setLyricsSettingsOpen(false)} showLyrics={true} />
      <NavidromeServerSettings visible={serverSettingsOpen} onClose={() => setServerSettingsOpen(false)} serverUrl={server?.url} />

      {random.songs.length > 0 && random.index >= 0 && (
        <NavidromePlayer
          visible
          songs={random.songs}
          startIndex={random.index}
          server={server}
          preferences={prefs}
          onClose={() => setRandom({ songs: [], index: -1 })}
        />
      )}
      {random.songs.length > 0 && random.index >= 0 && (
        <NavidromePlayerBar
          visible
          songs={random.songs}
          index={random.index}
          server={server}
          onClose={() => setRandom({ songs: [], index: -1 })}
          onAdvance={() => { setRandom({ songs: random.songs, index: (random.index + 1) % random.songs.length }) }}
        />
      )}
    </View>
  )
}

function AlbumRow({ server, albums, onPress }: { server: NavidromeServerConfig; albums: NavidromeAlbum[]; onPress: (a: NavidromeAlbum) => void }) {
  const t = useTheme()
  if (albums.length === 0) return null
  const ITEM_W = 110
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 10 }}>
      {albums.map((a) => (
        <TouchableOpacity key={a.id} style={{ width: ITEM_W }} activeOpacity={0.7} onPress={() => onPress(a)}>
          <View style={{ width: ITEM_W, height: ITEM_W, borderRadius: 8, overflow: 'hidden', backgroundColor: t.border }}>
            <UriImage uri={navidromeGetCoverArtUrl(server, a.coverArt, 220)} />
          </View>
          <Text style={[styles.dirItemText, { color: t.text, marginTop: 4 }]} numberOfLines={2}>{a.name}</Text>
          {a.artist && <Text style={[styles.dirMeta, { color: t.textMuted }]} numberOfLines={1}>{a.artist}</Text>}
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

function PlaylistList({ server, playlists, onPress }: { server: NavidromeServerConfig; playlists: NavidromePlaylist[]; onPress: (p: NavidromePlaylist) => void }) {
  const t = useTheme()
  const { navidromeGetCoverArtUrl } = require('@/lib/api/navidrome') as typeof import('@/lib/api/navidrome')
  if (playlists.length === 0) return null
  return (
    <View style={{ paddingHorizontal: 16 }}>
      {playlists.map((p) => (
        <TouchableOpacity
          key={p.id}
          style={[styles.dirItem, { borderBottomColor: t.border }]}
          activeOpacity={0.7}
          onPress={() => onPress(p)}
        >
          {p.coverArt ? (
            <View style={{ width: 36, height: 36, borderRadius: 4, overflow: 'hidden', backgroundColor: t.border }}>
              <UriImage uri={navidromeGetCoverArtUrl(server, p.coverArt, 80) as any} />
            </View>
          ) : (
            <View style={[styles.smallIcon, { backgroundColor: t.primary }]}>
              <Icon name="queueMusic" size={18} color="#fff" />
            </View>
          )}
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.dirItemText, { color: t.text }]} numberOfLines={1}>{p.name}</Text>
            {p.songCount != null && <Text style={[styles.dirMeta, { color: t.textMuted }]}>{p.songCount} 首</Text>}
          </View>
          <Icon name="chevronRight" size={16} color={t.textMuted} />
        </TouchableOpacity>
      ))}
    </View>
  )
}

function SectionIcon({ name, color, size = 18 }: { name: string; color: string; size?: number }) {
  const iconName = ICON_MAP[name]
  if (iconName) {
    return <Icon name={iconName} size={size} color={color} />
  }
  return <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: color }} />
}

type IconKey = 'trendingUp' | 'plus' | 'grid' | 'person' | 'star' | 'folderEmpty' | 'queueMusic' | 'images' | 'schedule' | 'skipPrev' | 'skipNext' | 'music'

const ICON_MAP: Record<string, IconKey> = {
  clock: 'schedule',
  trendingUp: 'trendingUp',
  plus: 'plus',
  grid: 'grid',
  person: 'person',
  user: 'person',
  folder: 'folderEmpty',
  folderEmpty: 'folderEmpty',
  star: 'star',
  listMusic: 'queueMusic',
  images: 'images',
  schedule: 'schedule',
  skipPrev: 'skipPrev',
  skipNext: 'skipNext',
  music: 'music',
}

const ALBUM_SORT_OPTIONS: { label: string; value: 'name' | 'artist' | 'created'; subsonicType: string }[] = [
  { label: '名称', value: 'name', subsonicType: 'alphabeticalByName' },
  { label: '艺术家', value: 'artist', subsonicType: 'alphabeticalByArtist' },
  { label: '最近添加', value: 'created', subsonicType: 'newest' },
]

const ALBUM_SORT_TYPE: Record<string, string> = {
  name: 'alphabeticalByName',
  artist: 'alphabeticalByArtist',
  created: 'newest',
}

function HomeSection({
  title,
  icon,
  server,
  onSeeAll,
  children,
}: {
  title: string
  icon: string
  server: NavidromeServerConfig
  onSeeAll?: () => void
  children: React.ReactNode
}) {
  const t = useTheme()
  void server // keep parameter for stable type
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          <SectionIcon name={icon} color={t.primary} />
          <Text style={[styles.sectionTitle, { color: t.text }]}>{title}</Text>
        </View>
        {onSeeAll ? (
          <TouchableOpacity onPress={onSeeAll}>
            <Text style={{ color: t.primary, fontSize: 12 }}>查看全部 ›</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  )
}

function AlbumHeader({ server, album, songs, onPlay, onStarToggle }: { server: NavidromeServerConfig; album: NavidromeAlbum; songs: NavidromeSong[]; onPlay: () => void; onStarToggle?: (starred: boolean) => void }) {
  const t = useTheme()
  const isStarred = !!album.starred
  return (
    <View style={[styles.detailHeader, { backgroundColor: t.card }]}>
      <View style={{ flexDirection: 'row', padding: 12, alignItems: 'center' }}>
        <NavidromeAlbumHeaderCover server={server} album={album} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.detailTitle, { color: t.text }]} numberOfLines={2}>{album.name}</Text>
          <Text style={[styles.detailSub, { color: t.textMuted }]} numberOfLines={1}>{album.artist ?? '未知'}</Text>
          <Text style={[styles.detailMeta, { color: t.textMuted }]}>
            {album.year ?? ''}{album.songCount ? ` · ${album.songCount} 首` : ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            {songs.length > 0 && (
              <TouchableOpacity onPress={onPlay} style={[styles.playAllBtn, { backgroundColor: t.primary }]}>
                <Icon name="playCircle" size={18} color="#fff" />
                <Text style={styles.playAllText}>播放全部</Text>
              </TouchableOpacity>
            )}
            {onStarToggle && (
              <TouchableOpacity onPress={() => onStarToggle(isStarred)} style={{ padding: 4 }}>
                <Icon name={isStarred ? 'star' : 'star'} size={20} color={isStarred ? t.warning : t.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  )
}

function ArtistHeader({ server, artist }: { server: NavidromeServerConfig; artist: NavidromeArtist }) {
  const t = useTheme()
  void server
  return (
    <View style={[styles.detailHeader, { backgroundColor: t.card, paddingVertical: 24 }]}>
      <View style={{ alignItems: 'center' }}>
        <View style={[styles.artistAvatar, { backgroundColor: t.primary }]}>
          <Text style={styles.artistAvatarText}>{artist.name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={[styles.detailTitle, { color: t.text, marginTop: 12 }]} numberOfLines={2}>{artist.name}</Text>
        {artist.albumCount != null ? (
          <Text style={[styles.detailMeta, { color: t.textMuted }]}>{artist.albumCount} 张专辑</Text>
        ) : null}
      </View>
    </View>
  )
}

function PlaylistHeader({ server, playlist, onPlay }: { server: NavidromeServerConfig; playlist: NavidromePlaylist; onPlay: () => void }) {
  const t = useTheme()
  return (
    <View style={[styles.detailHeader, { backgroundColor: t.card }]}>
      <View style={{ flexDirection: 'row', padding: 12, alignItems: 'center' }}>
        <View style={[styles.playlistArt, { backgroundColor: t.border }]}>
          <UriImage uri={navidromeGetCoverArtUrl(server, playlist.coverArt, 240)} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.detailTitle, { color: t.text }]} numberOfLines={2}>{playlist.name}</Text>
          {playlist.songCount != null ? (
            <Text style={[styles.detailMeta, { color: t.textMuted }]}>{playlist.songCount} 首</Text>
          ) : null}
          <TouchableOpacity onPress={onPlay} style={[styles.playAllBtn, { backgroundColor: t.primary, marginTop: 8 }]}>
            <Icon name="playCircle" size={18} color="#fff" />
            <Text style={styles.playAllText}>播放</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

function NavidromeAlbumHeaderCover({ server, album }: { server: NavidromeServerConfig; album: NavidromeAlbum }) {
  const t = useTheme()
  void server
  const { navidromeGetCoverArtUrl } = require('@/lib/api/navidrome') as typeof import('@/lib/api/navidrome')
  return (
    <View style={[styles.coverArt, { backgroundColor: t.border }]}>
      <View style={{ width: 96, height: 96 }}>
        <View style={{ width: 96, height: 96, borderRadius: 8, overflow: 'hidden' }}>
          {/* Use RN Image directly to avoid extra component overhead for header */}
          <View style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="music" size={32} color={t.textMuted} />
          </View>
          <UriImage uri={navidromeGetCoverArtUrl(server, album.coverArt, 240)} />
        </View>
      </View>
    </View>
  )
}

function UriImage({ uri }: { uri: string | undefined }) {
  if (!uri) return null
  const { Image } = require('react-native') as typeof import('react-native')
  return <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
}

function SortModal({
  options, selected, onSelect, onClose,
}: {
  options: { label: string; value: string }[]
  selected: string
  onSelect: (value: string) => void
  onClose: () => void
}) {
  const t = useTheme()
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.sortOverlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.sortDropdown, { backgroundColor: t.card, borderColor: t.border }]}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.sortOption, { borderBottomColor: t.border }]}
              onPress={() => onSelect(opt.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.sortOptionText, { color: t.text }]}>{opt.label}</Text>
              {selected === opt.value && <Icon name="check" size={14} color={t.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
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
  scrollContent: { paddingTop: 12, paddingBottom: 32 },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 10,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  emptyHint: { textAlign: 'center', marginVertical: 32, fontSize: 14 },
  folderRow: { paddingHorizontal: 12, gap: 10 },
  folderCard: {
    width: 110, padding: 10, borderRadius: 10,
    alignItems: 'center',
  },
  folderTitle: { fontSize: 12, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  folderMeta: { fontSize: 11, marginTop: 2 },
  detailContent: { paddingTop: 8, paddingBottom: 32 },
  detailHeader: { marginHorizontal: 12, borderRadius: 12, overflow: 'hidden' },
  detailTitle: { fontSize: 18, fontWeight: '700' },
  detailSub: { fontSize: 14, marginTop: 4 },
  detailMeta: { fontSize: 12, marginTop: 6 },
  playAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    marginTop: 12, alignSelf: 'flex-start',
  },
  playAllText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  artistAvatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  artistAvatarText: { color: '#fff', fontSize: 36, fontWeight: '700' },
  playlistArt: { width: 96, height: 96, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  coverArt: { width: 96, height: 96, borderRadius: 8, overflow: 'hidden' },
  dirItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  dirItemText: { fontSize: 14, fontWeight: '500', flex: 1 },
  dirMeta: { fontSize: 11, marginTop: 1 },
  smallIcon: { width: 36, height: 36, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  songRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  songTrack: { width: 30, alignItems: 'center' },
  songTrackText: { fontSize: 12, fontWeight: '500' },
  songTitle: { fontSize: 14, fontWeight: '500' },
  songArtist: { fontSize: 11, marginTop: 2 },
  songCount: { fontSize: 11, marginHorizontal: 8 },
  songDuration: { fontSize: 12, minWidth: 40, textAlign: 'right' },
  sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sortFieldText: { fontSize: 14, fontWeight: '500' },
  sortArrowBtn: { paddingVertical: 4, paddingHorizontal: 6 },
  sortOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  sortDropdown: { width: 200, borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  sortOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  sortOptionText: { flex: 1, fontSize: 15 },
})