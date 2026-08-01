import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { NavidromePreferences, NavidromeLyricPosition, NavidromeLyricAlignment, NavidromeLyricLineCount } from '@/types'

interface NavidromePlaybackState extends NavidromePreferences {
  loadFromStorage: () => Promise<void>
  setShowRecentAlbums: (v: boolean) => void
  setShowMostPlayed: (v: boolean) => void
  setShowFreshAlbums: (v: boolean) => void
  setShowStarred: (v: boolean) => void
  setShowMusicFolders: (v: boolean) => void
  setShowPlaylists: (v: boolean) => void
  setShowPlayCount: (v: boolean) => void
  setCacheSongs: (v: boolean) => void
  setMaxCacheMB: (v: number) => void
  setLyricNotification: (v: boolean) => void
  setLyricDesktop: (v: boolean) => void
  setLyricInjectSystem: (v: boolean) => void
  setLyricOpacity: (v: number) => void
  setLyricPosition: (v: NavidromeLyricPosition) => void
  setLyricColor: (v: number) => void
  setLyricBgAlpha: (v: number) => void
  setLyricAlignment: (v: NavidromeLyricAlignment) => void
  setLyricLineCount: (v: NavidromeLyricLineCount) => void
  setLyricDesktopPositionY: (v: number) => void
  setLyricDesktopFontSize: (v: number) => void
}

const STORAGE_KEY = 'navidrome:preferences'

const DEFAULTS: NavidromePreferences = {
  showRecentAlbums: true,
  showMostPlayed: true,
  showFreshAlbums: true,
  showStarred: true,
  showMusicFolders: true,
  showPlaylists: true,
  showPlayCount: false,
  cacheSongs: true,
  maxCacheMB: 500,
  lyricNotification: false,
  lyricDesktop: false,
  lyricInjectSystem: false,
  lyricOpacity: 0.85,
  lyricPosition: 'top',
  lyricColor: 0xFFFFFF,
  lyricBgAlpha: 70,
  lyricAlignment: 'center',
  lyricLineCount: 4,
  lyricDesktopPositionY: 0,
  lyricDesktopFontSize: 24,
}

export const useNavidromePlaybackStore = create<NavidromePlaybackState>((set) => ({
  ...DEFAULTS,
  loadFromStorage: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        set({ ...DEFAULTS, ...saved })
      }
    } catch {}
  },
  setShowRecentAlbums: (v) => set({ showRecentAlbums: v }),
  setShowMostPlayed: (v) => set({ showMostPlayed: v }),
  setShowFreshAlbums: (v) => set({ showFreshAlbums: v }),
  setShowStarred: (v) => set({ showStarred: v }),
  setShowMusicFolders: (v) => set({ showMusicFolders: v }),
  setShowPlaylists: (v) => set({ showPlaylists: v }),
  setShowPlayCount: (v) => set({ showPlayCount: v }),
  setCacheSongs: (v) => set({ cacheSongs: v }),
  setMaxCacheMB: (v) => set({ maxCacheMB: v }),
  setLyricNotification: (v) => set({ lyricNotification: v }),
  setLyricDesktop: (v) => set({ lyricDesktop: v }),
  setLyricInjectSystem: (v) => set({ lyricInjectSystem: v }),
  setLyricOpacity: (v) => set({ lyricOpacity: v }),
  setLyricPosition: (v) => set({ lyricPosition: v }),
  setLyricColor: (v) => set({ lyricColor: v }),
  setLyricBgAlpha: (v) => set({ lyricBgAlpha: v }),
  setLyricAlignment: (v) => set({ lyricAlignment: v }),
  setLyricLineCount: (v) => set({ lyricLineCount: v }),
  setLyricDesktopPositionY: (v) => set({ lyricDesktopPositionY: v }),
  setLyricDesktopFontSize: (v) => set({ lyricDesktopFontSize: v }),
}))

// persist prefs on change
if (typeof window !== 'undefined') {
  useNavidromePlaybackStore.subscribe(async (state) => {
    try {
      const { AsyncStorage } = await import('@react-native-async-storage/async-storage')
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {}
  })
}
