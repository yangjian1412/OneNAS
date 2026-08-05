import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { KomgaServerConfig, KomgaLibrary, KomgaSeries, KomgaBook } from '@/types'
import { komgaLogin, komgaListLibraries, komgaListNewSeries, komgaOnDeck, komgaListSeries } from '@/lib/api/komga'

const AUTO_REFRESH_KEY = 'komga:autorefresh'
const HOMEPAGE_LIBS_PER_ROW = 10

interface KomgaState {
  server: KomgaServerConfig | null
  libraries: KomgaLibrary[]
  continueReading: KomgaBook[]
  newByLibrary: Record<string, KomgaSeries[]>   // libraryId → 最新 N 本 series
  loading: boolean
  error: string | null
  autoRefresh: boolean

  setServer: (s: KomgaServerConfig | null) => void
  setAutoRefresh: (v: boolean) => void
  initWithService: (svc: { id: string; name: string; url: string; username?: string; password?: string }) => Promise<void>
  logout: () => void
  refresh: () => Promise<void>

  // 数据加载
  loadContinueReading: () => Promise<void>
  loadLibraryPreviews: () => Promise<void>
}

let pollTimer: ReturnType<typeof setInterval> | null = null
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

export const useKomgaStore = create<KomgaState>((set, get) => {
  const startPolling = () => {
    stopPolling()
    const s = get()
    if (!s.autoRefresh || !s.server) return
    pollTimer = setInterval(() => { void get().refresh() }, 30000)
  }
  return {
    server: null,
    libraries: [],
    continueReading: [],
    newByLibrary: {},
    loading: false,
    error: null,
    autoRefresh: true,

    setServer: (server) => {
      set({ server })
      startPolling()
    },
    setAutoRefresh: (autoRefresh) => {
      set({ autoRefresh })
      AsyncStorage.setItem(AUTO_REFRESH_KEY, autoRefresh ? '1' : '0').catch(() => {})
      startPolling()
    },
    initWithService: async (svc) => {
      // 从 appStore 的 ServiceConfig 构造 KomgaServerConfig
      const server: KomgaServerConfig = {
        id: svc.id,
        name: svc.name,
        url: svc.url.replace(/\/+$/, ''),
        username: svc.username ?? '',
        password: svc.password ?? '',
      }
      const loginRes = await komgaLogin(server)
      if (!loginRes.ok) {
        set({ server, error: loginRes.error ?? '登录失败' })
        return
      }
      server.userId = loginRes.userId
      server.userName = loginRes.userName
      set({ server, error: null })
      startPolling()
      await get().refresh()
    },
    logout: () => {
      stopPolling()
      set({ server: null, libraries: [], continueReading: [], newByLibrary: {}, error: null })
    },
    refresh: async () => {
      const s = get()
      if (!s.server) return
      set({ loading: true, error: null })
      try {
        await Promise.all([
          get().loadContinueReading(),
          get().loadLibraryPreviews(),
        ])
      } catch (e: any) {
        set({ error: e?.message ?? '刷新失败' })
      } finally {
        set({ loading: false })
      }
    },
    loadContinueReading: async () => {
      const s = get()
      if (!s.server) return
      try {
        const books = await komgaOnDeck(s.server, undefined, 10)
        set({ continueReading: books })
      } catch {
        // 容错：单个失败不影响其它
      }
    },
    loadLibraryPreviews: async () => {
      const s = get()
      if (!s.server) return
      try {
        const libraries = await komgaListLibraries(s.server)
        const newByLibrary: Record<string, KomgaSeries[]> = {}
        // 并发拉每个库的最新 N 本
        await Promise.all(
          libraries
            .filter((lib) => !lib.unavailable)
            .map(async (lib) => {
              try {
                const series = await komgaListNewSeries(s.server!, [lib.id], HOMEPAGE_LIBS_PER_ROW)
                newByLibrary[lib.id] = series
              } catch {
                newByLibrary[lib.id] = []
              }
            }),
        )
        set({ libraries, newByLibrary })
      } catch {
        // 同上容错
      }
    },
  }
})

export async function loadKomgaAutoRefreshPersisted(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(AUTO_REFRESH_KEY)
    return v !== '0'
  } catch {
    return true
  }
}