import { create } from 'zustand'
import { JellyfinServerConfig, JellyfinLibrary, JellyfinItem, JellyfinUser, ServiceConfig } from '@/types'
import { jellyfinLogin, jellyfinGetResumeItems } from '@/lib/api/jellyfin'

interface JellyfinState {
  serviceId: string | null
  server: JellyfinServerConfig | null
  user: JellyfinUser | null
  libraries: JellyfinLibrary[]
  resumeItems: JellyfinItem[]
  isLoading: boolean
  error: string | null

  setServiceId: (id: string | null) => void
  setServer: (server: JellyfinServerConfig | null) => void
  setUser: (user: JellyfinUser | null) => void
  setLibraries: (libs: JellyfinLibrary[]) => void
  setResumeItems: (items: JellyfinItem[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  resetForService: (serviceId: string) => void
  logout: () => void
  initWithService: (service: ServiceConfig) => Promise<void>
  // 仅刷 "继续观看" resume 列表（播放完/下一集后调用，主界面即自动反映最新进度）
  refreshResume: () => Promise<void>
}

export const useJellyfinStore = create<JellyfinState>((set, get) => ({
  serviceId: null,
  server: null,
  user: null,
  libraries: [],
  resumeItems: [],
  isLoading: false,
  error: null,

  setServiceId: (serviceId) => set({ serviceId }),
  setServer: (server) => set({ server }),
  setUser: (user) => set({ user }),
  setLibraries: (libraries) => set({ libraries }),
  setResumeItems: (resumeItems) => set({ resumeItems }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  resetForService: (serviceId) => set({ serviceId, server: null, user: null, libraries: [], resumeItems: [], error: null }),
  logout: () => set({ serviceId: null, server: null, user: null, libraries: [], resumeItems: [], error: null }),
  initWithService: async (service: ServiceConfig) => {
    if (get().serviceId !== service.id) {
      set({ serviceId: service.id, server: null, user: null, libraries: [], resumeItems: [], error: null })
    }
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
  refreshResume: async () => {
    const { server } = get()
    if (!server) return
    const r = await jellyfinGetResumeItems(server)
    if (r.ok) set({ resumeItems: r.items ?? [] })
  },
}))
