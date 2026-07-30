import { create } from 'zustand'
import type {
  NavidromeServerConfig,
  NavidromeArtist,
  NavidromeAlbum,
  NavidromeSong,
  NavidromePlaylist,
  NavidromePreferences,
  ServiceConfig,
} from '@/types'
import { navidromeLogin, navidromeGetArtists, navidromeGetAlbums, navidromeGetPlaylists, navidromeGetStarred } from '@/lib/api/navidrome'

interface NavidromeState {
  server: NavidromeServerConfig | null
  artists: NavidromeArtist[]
  recentAlbums: NavidromeAlbum[]
  freshAlbums: NavidromeAlbum[]
  mostPlayed: NavidromeAlbum[]
  playlists: NavidromePlaylist[]
  starredAlbums: NavidromeAlbum[]
  starredArtists: NavidromeArtist[]
  starredSongs: NavidromeSong[]
  isLoading: boolean
  error: string | null

  setServer: (server: NavidromeServerConfig | null) => void
  setArtists: (artists: NavidromeArtist[]) => void
  setRecentAlbums: (albums: NavidromeAlbum[]) => void
  setFreshAlbums: (albums: NavidromeAlbum[]) => void
  setMostPlayed: (albums: NavidromeAlbum[]) => void
  setPlaylists: (playlists: NavidromePlaylist[]) => void
  setStarredAlbums: (albums: NavidromeAlbum[]) => void
  setStarredArtists: (artists: NavidromeArtist[]) => void
  setStarredSongs: (songs: NavidromeSong[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  logout: () => void

  initWithService: (service: ServiceConfig) => Promise<void>
}

export const useNavidromeStore = create<NavidromeState>((set) => ({
  server: null,
  artists: [],
  recentAlbums: [],
  freshAlbums: [],
  mostPlayed: [],
  playlists: [],
  starredAlbums: [],
  starredArtists: [],
  starredSongs: [],
  isLoading: false,
  error: null,

  setServer: (server) => set({ server }),
  setArtists: (artists) => set({ artists }),
  setRecentAlbums: (recentAlbums) => set({ recentAlbums }),
  setFreshAlbums: (freshAlbums) => set({ freshAlbums }),
  setMostPlayed: (mostPlayed) => set({ mostPlayed }),
  setPlaylists: (playlists) => set({ playlists }),
  setStarredAlbums: (starredAlbums) => set({ starredAlbums }),
  setStarredArtists: (starredArtists) => set({ starredArtists }),
  setStarredSongs: (starredSongs) => set({ starredSongs }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  logout: () =>
    set({
      server: null,
      artists: [],
      recentAlbums: [],
      freshAlbums: [],
      mostPlayed: [],
      playlists: [],
      starredAlbums: [],
      starredArtists: [],
      starredSongs: [],
      error: null,
    }),
  initWithService: async (service) => {
    if (!service.url || !service.username || !service.password) {
      set({ error: 'Missing Navidrome URL, username or password' })
      return
    }
    set({ isLoading: true, error: null })
    const result = await navidromeLogin(service.url, service.username, service.password)
    if (result.ok && result.server) {
      set({ server: result.server, isLoading: false })
    } else {
      set({ error: result.error ?? 'Login failed', isLoading: false })
    }
  },
}))

// Helper to load all home sections
export async function loadNavidromeHome(server: NavidromeServerConfig) {
  const [artists, recents, fresh, frequent, playlists, starred] = await Promise.all([
    navidromeGetArtists(server),
    navidromeGetAlbums(server, { type: 'recent', size: 20 }),
    navidromeGetAlbums(server, { type: 'newest', size: 20 }),
    navidromeGetAlbums(server, { type: 'frequent', size: 20 }),
    navidromeGetPlaylists(server),
    navidromeGetStarred(server),
  ])
  return {
    artists: artists.ok ? artists.items ?? [] : [],
    recentAlbums: recents.ok ? recents.items ?? [] : [],
    freshAlbums: fresh.ok ? fresh.items ?? [] : [],
    mostPlayed: frequent.ok ? frequent.items ?? [] : [],
    playlists: playlists.ok ? playlists.items ?? [] : [],
    starredAlbums: starred.ok ? starred.albums ?? [] : [],
    starredArtists: starred.ok ? starred.artists ?? [] : [],
    starredSongs: starred.ok ? starred.songs ?? [] : [],
  }
}