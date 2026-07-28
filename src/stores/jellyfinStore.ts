import { create } from 'zustand'
import { JellyfinServerConfig, JellyfinLibrary, JellyfinItem, JellyfinUser, ServiceConfig } from '@/types'
import { jellyfinLogin } from '@/lib/api/jellyfin'

interface JellyfinState {
  server: JellyfinServerConfig | null
  user: JellyfinUser | null
  libraries: JellyfinLibrary[]
  resumeItems: JellyfinItem[]
  isLoading: boolean
  error: string | null

  setServer: (server: JellyfinServerConfig | null) => void
  setUser: (user: JellyfinUser | null) => void
  setLibraries: (libs: JellyfinLibrary[]) => void
  setResumeItems: (items: JellyfinItem[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  logout: () => void
  initWithService: (service: ServiceConfig) => Promise<void>
}

export const useJellyfinStore = create<JellyfinState>((set) => ({
  server: null,
  user: null,
  libraries: [],
  resumeItems: [],
  isLoading: false,
  error: null,

  setServer: (server) => set({ server }),
  setUser: (user) => set({ user }),
  setLibraries: (libraries) => set({ libraries }),
  setResumeItems: (resumeItems) => set({ resumeItems }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  logout: () => set({ server: null, user: null, libraries: [], resumeItems: [], error: null }),
  initWithService: async (service: ServiceConfig) => {
    if (!service.url || !service.username || !service.password) {
      set({ error: 'Missing Jellyfin URL, username or password' })
      return
    }
    set({ isLoading: true, error: null })
    const result = await jellyfinLogin(service.url, service.username, service.password)
    if (result.ok && result.server) {
      set({ server: result.server, isLoading: false })
    } else {
      set({ error: result.error ?? 'Login failed', isLoading: false })
    }
  },
}))
