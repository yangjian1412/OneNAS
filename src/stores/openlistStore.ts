import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import type {
  OpenListServerConfig,
  OpenListFile,
  ServiceConfig,
} from '@/types'

const DOWNLOADER_PREFIX = 'openlist:downloader:'
import {
  openListPing,
  openListList,
  openListMkdir,
  openListRemove,
  openListRename,
  openListLogin,
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

  /*** 下载工具（aria2）配置：独立缓存 + 立即写入当前 server ***/
  getDownloader: () => Promise<NonNullable<OpenListServerConfig['downloader']> | null>
  setDownloader: (dl: NonNullable<OpenListServerConfig['downloader']> | null) => Promise<void>
}

function normalizeFromService(svc: ServiceConfig): OpenListServerConfig {
  return {
    id: svc.id,
    name: svc.name || 'OpenList',
    url: (svc.url || '').replace(/\/+$/, ''),
    username: svc.username || undefined,
    password: svc.password || undefined,
    token: svc.apiKey || undefined,
  }
}

// 规范化 OpenList 路径：保证以 / 开头、去掉 URL 前缀、去掉末尾斜杠
export function normalizeOpenListPath(p: string): string {
  let out = p
  if (/^https?:\/\//i.test(out)) {
    try { out = new URL(out).pathname } catch {}
  }
  if (!out.startsWith('/')) out = '/' + out
  out = out.replace(/\/+$/, '')
  return out || '/'
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
    const base = normalizeFromService(service)
    if (!base.url) {
      set({ error: 'OpenList 未配置 URL' })
      return
    }
    const dl = await getDownloaderCached(base.id)
    const cfg: OpenListServerConfig = dl ? { ...base, downloader: dl } : base

    // 无 token 但有用户名密码 → 自动登录获取 token
    if (!cfg.token && cfg.username && cfg.password) {
      const login = await openListLogin(cfg)
      if (login.ok && login.token) {
        cfg.token = login.token
      }
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
    const normalized = normalizeOpenListPath(path)
    set({ loading: true, error: null, path: normalized })
    const files = await openListList(server, normalized)
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

  getDownloader: async () => {
    const id = get().server?.id
    if (!id) return null
    const cached = await getDownloaderCached(id)
    if (cached) return cached
    const cur = get().server?.downloader ?? null
    if (cur && cur.url) {
      await saveDownloaderCached(id, cur)
      return cur
    }
    return null
  },

  setDownloader: async (dl) => {
    const id = get().server?.id
    set({ server: get().server ? { ...get().server!, downloader: dl ?? undefined } : null })
    if (id) {
      if (dl) await saveDownloaderCached(id, dl)
      else await clearDownloaderCached(id)
    }
  },
}))

async function saveDownloaderCached(id: string, dl: NonNullable<OpenListServerConfig['downloader']>): Promise<void> {
  try { await AsyncStorage.setItem(DOWNLOADER_PREFIX + id, JSON.stringify(dl)) } catch {}
}

async function getDownloaderCached(id: string): Promise<NonNullable<OpenListServerConfig['downloader']> | null> {
  try {
    const raw = await AsyncStorage.getItem(DOWNLOADER_PREFIX + id)
    return raw ? (JSON.parse(raw) as NonNullable<OpenListServerConfig['downloader']>) : null
  } catch { return null }
}

async function clearDownloaderCached(id: string): Promise<void> {
  try { await AsyncStorage.removeItem(DOWNLOADER_PREFIX + id) } catch {}
}