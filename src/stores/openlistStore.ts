import { create } from 'zustand'
import type {
  OpenListServerConfig,
  OpenListFile,
  ServiceConfig,
} from '@/types'
import {
  openListPing,
  openListList,
  openListMkdir,
  openListRemove,
  openListRename,
} from '@/lib/api/openlist'

interface OpenListState {
  server: OpenListServerConfig | null
  path: string
  files: OpenListFile[]
  loading: boolean
  error: string | null

  setServer: (server: OpenListServerConfig | null) => void
  setError: (e: string | null) => void
  logout: () => void

  cd: (path: string) => Promise<void>
  up: () => Promise<void>
  refresh: () => Promise<void>
  mkdir: (name: string) => Promise<boolean>
  remove: (names: string[], dir?: boolean) => Promise<boolean>
  rename: (path: string, newName: string) => Promise<boolean>
  initWithService: (service: ServiceConfig) => Promise<void>
}

function normalizeFromService(svc: ServiceConfig): OpenListServerConfig {
  return {
    id: svc.id,
    name: svc.name || 'OpenList',
    url: (svc.url || '').replace(/\/+$/, ''),
    token: svc.apiKey || undefined,
  }
}

export const useOpenListStore = create<OpenListState>((set, get) => ({
  server: null,
  path: '/',
  files: [],
  loading: false,
  error: null,

  setServer: (server) => set({ server }),
  setError: (error) => set({ error }),
  logout: () => set({ server: null, files: [], path: '/', error: null }),

  initWithService: async (service) => {
    const cfg = normalizeFromService(service)
    if (!cfg.url) {
      set({ error: 'OpenList 未配置 URL' })
      return
    }
    set({ server: cfg, error: null })
    const ping = await openListPing(cfg)
    if (!ping.ok) {
      set({ error: ping.error ?? 'OpenList 连接失败' })
      return
    }
    void get().cd('/')
  },

  cd: async (path) => {
    const server = get().server
    if (!server) return
    set({ loading: true, error: null, path })
    const files = await openListList(server, path)
    set({ files, loading: false })
  },

  up: async () => {
    const cur = get().path
    if (cur === '/' || cur === '') return
    const parent = cur.replace(/\/+$/, '').split('/').slice(0, -1).join('/') || '/'
    await get().cd(parent)
  },

  refresh: async () => {
    await get().cd(get().path)
  },

  mkdir: async (name) => {
    const server = get().server
    if (!server) return false
    const target = `${get().path.replace(/\/+$/, '')}/${name}`
    const ok = await openListMkdir(server, target)
    if (ok) await get().refresh()
    return ok
  },

  remove: async (names, dir = false) => {
    const server = get().server
    if (!server) return false
    const targets = names.map((n) => `${get().path.replace(/\/+$/, '')}/${n}`)
    const ok = await openListRemove(server, targets, dir)
    if (ok) await get().refresh()
    return ok
  },

  rename: async (path, newName) => {
    const server = get().server
    if (!server) return false
    const ok = await openListRename(server, path, newName)
    if (ok) await get().refresh()
    return ok
  },
}))