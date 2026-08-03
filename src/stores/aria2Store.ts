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

  setServer: (server: Aria2ServerConfig | null) => void
  setError: (e: string | null) => void
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

export const useAria2Store = create<Aria2State>((set, get) => ({
  server: null,
  version: '',
  active: [],
  waiting: [],
  stopped: [],
  globalStat: null,
  globalOption: {},
  isLoading: false,
  error: null,

  setServer: (server) => set({ server }),
  setError: (error) => set({ error }),
  logout: () => set({
    server: null,
    version: '',
    active: [],
    waiting: [],
    stopped: [],
    globalStat: null,
    globalOption: {},
    error: null,
  }),

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
  },

  loadHome: async () => {
    const server = get().server
    if (!server) return
    set({ isLoading: true, error: null })
    const [v, stat, active, waiting, stopped] = await Promise.all([
      aria2GetVersion(server),
      aria2GetGlobalStat(server),
      aria2TellActive(server),
      aria2TellWaiting(server, 0, 100),
      aria2TellStopped(server, 0, 100),
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
}))