import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import type {
  Aria2ServerConfig,
  Aria2Task,
  Aria2GlobalStat,
  ServiceConfig,
} from '@/types'
import {
  aria2GetVersion,
  aria2GetGlobalStat,
  aria2TellActive,
  aria2TellWaiting,
  aria2TellStopped,
  aria2Pause,
  aria2Unpause,
  aria2Remove,
  aria2ForceRemove,
  aria2AddUri,
  aria2Ping,
  aria2GetGlobalOption,
  aria2ChangeGlobalOption,
} from '@/lib/api/aria2'

const AUTO_REFRESH_MS = 1000
const AUTOREFRESH_KEY = 'aria2:autorefresh'

interface Aria2State {
  server: Aria2ServerConfig | null
  version: string
  active: Aria2Task[]
  waiting: Aria2Task[]
  stopped: Aria2Task[]
  globalStat: Aria2GlobalStat | null
  globalOption: Record<string, string>
  isLoading: boolean
  error: string | null
  autoRefresh: boolean

  setServer: (server: Aria2ServerConfig | null) => void
  setError: (e: string | null) => void
  setAutoRefresh: (v: boolean) => void
  logout: () => void

  loadHome: () => Promise<void>
  refresh: () => Promise<void>
  pause: (gid: string) => Promise<void>
  unpause: (gid: string) => Promise<void>
  remove: (gid: string) => Promise<void>
  forceRemove: (gid: string) => Promise<void>
  addUri: (uris: string[], options?: Record<string, string>) => Promise<string | null>
  loadGlobalOption: () => Promise<void>
  saveGlobalOption: (options: Record<string, string>) => Promise<boolean>
  initWithService: (service: ServiceConfig) => Promise<void>
}

function normalizeFromService(svc: ServiceConfig): Aria2ServerConfig {
  let url = (svc.url || '').trim()
  if (url && !/\/jsonrpc$/i.test(url)) url = url.replace(/\/+$/, '') + '/jsonrpc'
  return {
    id: svc.id,
    name: svc.name || 'Aria2',
    url,
    secret: svc.apiKey || svc.password || '',
  }
}

// 单例轮询器：所有 screen 实例共享一份 setInterval
let pollTimer: ReturnType<typeof setInterval> | null = null
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

export const useAria2Store = create<Aria2State>((set, get) => {
  const startPolling = () => {
    stopPolling()
    const s = get()
    if (!s.autoRefresh || !s.server) return
    pollTimer = setInterval(() => { void get().refresh() }, AUTO_REFRESH_MS)
  }

  return {
    server: null,
    version: '',
    active: [],
    waiting: [],
    stopped: [],
    globalStat: null,
    globalOption: {},
    isLoading: false,
    error: null,
    autoRefresh: true,

    setServer: (server) => { set({ server }); startPolling() },
    setError: (error) => set({ error }),
    setAutoRefresh: (v) => {
      set({ autoRefresh: v })
      AsyncStorage.setItem(AUTOREFRESH_KEY, v ? '1' : '0').catch(() => {})
      if (v) startPolling(); else stopPolling()
    },
    logout: () => {
      stopPolling()
      set({
        server: null,
        version: '',
        active: [],
        waiting: [],
        stopped: [],
        globalStat: null,
        globalOption: {},
        error: null,
      })
    },

    initWithService: async (service) => {
      const cfg = normalizeFromService(service)
      if (!cfg.url) {
        set({ error: 'Aria2 未配置 URL' })
        return
      }
      set({ server: cfg, error: null })
      const ping = await aria2Ping(cfg)
      if (!ping.ok) {
        set({ error: ping.error ?? 'Aria2 连接失败' })
        return
      }
      set({ version: ping.version ?? '' })
      void get().loadHome()
      void get().loadGlobalOption()
      startPolling()
    },

    loadHome: async () => {
      const server = get().server
      if (!server) return
      set({ isLoading: true, error: null })
      const [v, stat, active, waiting, stopped] = await Promise.all([
        aria2GetVersion(server),
        aria2GetGlobalStat(server),
        aria2TellActive(server),
        aria2TellWaiting(server, 0, 1024),
        aria2TellStopped(server, 0, 1024),
      ])
      set({
        version: v?.version ?? get().version,
        globalStat: stat,
        active,
        waiting,
        stopped,
        isLoading: false,
      })
    },

    refresh: async () => {
      await get().loadHome()
    },

    pause: async (gid) => {
      const server = get().server
      if (!server) return
      await aria2Pause(server, gid)
      await get().loadHome()
    },

    unpause: async (gid) => {
      const server = get().server
      if (!server) return
      await aria2Unpause(server, gid)
      await get().loadHome()
    },

    remove: async (gid) => {
      const server = get().server
      if (!server) return
      await aria2Remove(server, gid)
      await get().loadHome()
    },

    forceRemove: async (gid) => {
      const server = get().server
      if (!server) return
      await aria2ForceRemove(server, gid)
      await get().loadHome()
    },

    addUri: async (uris, options) => {
      const server = get().server
      if (!server) return null
      const gid = await aria2AddUri(server, uris, options)
      if (gid) await get().loadHome()
      return gid
    },

    loadGlobalOption: async () => {
      const server = get().server
      if (!server) return
      const opt = await aria2GetGlobalOption(server)
      if (opt) set({ globalOption: opt })
    },

    saveGlobalOption: async (options) => {
      const server = get().server
      if (!server) return false
      const ok = await aria2ChangeGlobalOption(server, options)
      if (ok) await get().loadGlobalOption()
      return ok
    },
  }
})

export async function loadAria2AutoRefreshPersisted(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(AUTOREFRESH_KEY)
    if (raw === '0') return false
    if (raw === '1') return true
    return true
  } catch { return true }
}