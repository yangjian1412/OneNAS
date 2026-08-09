import AsyncStorage from '@react-native-async-storage/async-storage'
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

const AUTO_REFRESH_MS = 1000
const AUTOREFRESH_KEY = 'qbittorrent:autorefresh'

interface QBitState {
  server: QBittorrentServerConfig | null
  tasks: QBitTorrentTask[]
  filter: 'all' | 'downloading' | 'completed' | 'paused'
  isLoading: boolean
  error: string | null
  autoRefresh: boolean

  setServer: (server: QBittorrentServerConfig | null) => void
  setFilter: (f: QBitState['filter']) => void
  setError: (e: string | null) => void
  setAutoRefresh: (v: boolean) => void
  logout: () => void

  loadHome: () => Promise<void>
  refresh: () => Promise<void>
  addUrl: (urls: string[]) => Promise<boolean>
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

// 单例轮询器：所有 screen 实例共享一份 setInterval
let pollTimer: ReturnType<typeof setInterval> | null = null
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

export const useQBitStore = create<QBitState>((set, get) => {
  const startPolling = () => {
    stopPolling()
    const s = get()
    if (!s.autoRefresh || !s.server) return
    pollTimer = setInterval(() => { void get().refresh() }, AUTO_REFRESH_MS)
  }

  return {
    server: null,
    tasks: [],
    filter: 'all',
    isLoading: false,
    error: null,
    autoRefresh: true,

    setServer: (server) => { set({ server }); startPolling() },
    setFilter: (filter) => {
      set({ filter })
      void get().loadHome()
    },
    setError: (error) => set({ error }),
    setAutoRefresh: (v) => {
      set({ autoRefresh: v })
      AsyncStorage.setItem(AUTOREFRESH_KEY, v ? '1' : '0').catch(() => {})
      if (v) startPolling(); else stopPolling()
    },
    logout: () => { stopPolling(); set({ server: null, tasks: [], error: null }) },

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
      startPolling()
    },

    loadHome: async () => {
      const server = get().server
      if (!server) return
      set({ isLoading: true, error: null })
      const tasks = await qbitList(server, get().filter)
      set({ tasks, isLoading: false, error: null })
    },

    refresh: async () => { await get().loadHome() },

    addUrl: async (urls) => {
      const server = get().server
      if (!server) return false
      const ok = await qbitAddUrl(server, urls)
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
  }
})

export async function loadQBitAutoRefreshPersisted(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(AUTOREFRESH_KEY)
    if (raw === '0') return false
    if (raw === '1') return true
    return true
  } catch { return true }
}