import { create } from 'zustand'
import type {
  QBittorrentServerConfig,
  QBitTorrentTask,
  ServiceConfig,
} from '@/types'
import {
  qbitPing,
  qbitList,
  qbitAddUrl,
  qbitAction,
} from '@/lib/api/qbittorrent'

interface QBitState {
  server: QBittorrentServerConfig | null
  tasks: QBitTorrentTask[]
  filter: 'all' | 'downloading' | 'completed' | 'paused'
  isLoading: boolean
  error: string | null

  setServer: (server: QBittorrentServerConfig | null) => void
  setFilter: (f: QBitState['filter']) => void
  setError: (e: string | null) => void
  logout: () => void

  loadHome: () => Promise<void>
  refresh: () => Promise<void>
  addUrl: (urls: string[], savePath?: string) => Promise<boolean>
  pause: (hashes: string[]) => Promise<void>
  resume: (hashes: string[]) => Promise<void>
  remove: (hashes: string[], deleteFiles?: boolean) => Promise<void>
  recheck: (hashes: string[]) => Promise<void>
  initWithService: (service: ServiceConfig) => Promise<void>
}

function normalizeFromService(svc: ServiceConfig): QBittorrentServerConfig {
  return {
    id: svc.id,
    name: svc.name || 'qBittorrent',
    url: (svc.url || '').replace(/\/+$/, ''),
    username: svc.username || '',
    password: svc.password || '',
  }
}

export const useQBitStore = create<QBitState>((set, get) => ({
  server: null,
  tasks: [],
  filter: 'all',
  isLoading: false,
  error: null,

  setServer: (server) => set({ server }),
  setFilter: (filter) => {
    set({ filter })
    void get().loadHome()
  },
  setError: (error) => set({ error }),
  logout: () => set({ server: null, tasks: [], error: null }),

  initWithService: async (service) => {
    const cfg = normalizeFromService(service)
    if (!cfg.url || !cfg.username) {
      set({ error: 'qBittorrent 未配置 URL 或用户名' })
      return
    }
    set({ server: cfg, error: null })
    const ping = await qbitPing(cfg)
    if (!ping.ok) {
      set({ error: ping.error ?? 'qBittorrent 登录失败' })
      return
    }
    void get().loadHome()
  },

  loadHome: async () => {
    const server = get().server
    if (!server) return
    set({ isLoading: true, error: null })
    const tasks = await qbitList(server, get().filter)
    set({ tasks, isLoading: false })
  },

  refresh: async () => { await get().loadHome() },

  addUrl: async (urls, savePath) => {
    const server = get().server
    if (!server) return false
    const ok = await qbitAddUrl(server, urls, savePath)
    if (ok) await get().loadHome()
    return ok
  },

  pause: async (hashes) => {
    const server = get().server
    if (!server) return
    await qbitAction(server, 'pause', hashes)
    await get().loadHome()
  },

  resume: async (hashes) => {
    const server = get().server
    if (!server) return
    await qbitAction(server, 'resume', hashes)
    await get().loadHome()
  },

  remove: async (hashes, deleteFiles = false) => {
    const server = get().server
    if (!server) return
    await qbitAction(server, 'delete', hashes, deleteFiles)
    await get().loadHome()
  },

  recheck: async (hashes) => {
    const server = get().server
    if (!server) return
    await qbitAction(server, 'recheck', hashes)
    await get().loadHome()
  },
}))