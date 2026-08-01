import { create } from 'zustand'
import {
  AudiobookshelfLibrary,
  AudiobookshelfLibraryItem,
  AudiobookshelfProgress,
  AudiobookshelfServerConfig,
  ServiceConfig,
} from '@/types'
import { initAudiobookshelfFromService } from '@/lib/api/audiobookshelf'

interface AudiobookshelfState {
  server: AudiobookshelfServerConfig | null
  libraries: AudiobookshelfLibrary[]
  resumeItems: AudiobookshelfLibraryItem[]
  recentByLibrary: Record<string, AudiobookshelfLibraryItem[]>
  isLoading: boolean
  error: string | null

  setServer: (server: AudiobookshelfServerConfig | null) => void
  setLibraries: (libs: AudiobookshelfLibrary[]) => void
  setResumeItems: (items: AudiobookshelfLibraryItem[]) => void
  setRecentForLibrary: (libraryId: string, items: AudiobookshelfLibraryItem[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  logout: () => void
  initWithService: (service: ServiceConfig) => Promise<{
    ok: boolean
    server?: AudiobookshelfServerConfig
    serverVersion?: string
    error?: string
  }>
}

export const useAudiobookshelfStore = create<AudiobookshelfState>((set) => ({
  server: null,
  libraries: [],
  resumeItems: [],
  recentByLibrary: {},
  isLoading: false,
  error: null,

  setServer: (server) => set({ server }),
  setLibraries: (libraries) => set({ libraries }),
  setResumeItems: (resumeItems) => set({ resumeItems }),
  setRecentForLibrary: (libraryId, items) =>
    set((s) => ({ recentByLibrary: { ...s.recentByLibrary, [libraryId]: items } })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  logout: () =>
    set({
      server: null,
      libraries: [],
      resumeItems: [],
      recentByLibrary: {},
      error: null,
    }),
  initWithService: async (service: ServiceConfig) => {
    if (!service.url || !service.username || !service.password) {
      set({ error: 'Missing Audiobookshelf URL, username or password' })
      return { ok: false, error: 'Missing URL/username/password' }
    }
    set({ isLoading: true, error: null })
    const result = await initAudiobookshelfFromService(service)
    if (result.ok && result.server) {
      set({ server: result.server, isLoading: false })
      return { ok: true, server: result.server, serverVersion: result.server.serverVersion }
    } else {
      set({ error: result.error ?? 'Login failed', isLoading: false })
      return { ok: false, error: result.error ?? 'Login failed' }
    }
  },
}))