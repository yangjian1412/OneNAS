import { create } from 'zustand'
import type {
  TalebookServerConfig,
  TalebookBook,
  TalebookBookDetail,
  TalebookIndexData,
  TalebookLoginMode,
  TalebookUserInfo,
  ServiceConfig,
} from '@/types'
import {
  talebookLoginWithCode,
  talebookLoginWithPassword,
  talebookLoginAsGuest,
  talebookGetUserInfo,
  talebookGetIndex,
  talebookGetReading,
  talebookGetShelf,
  talebookGetBookDetail,
  talebookToggleShelf,
} from '@/lib/api/talebook'
import { getCached, setCached } from '@/lib/api/talebookCache'

interface TalebookState {
  server: TalebookServerConfig | null
  userInfo: TalebookUserInfo | null
  readingBooks: TalebookBook[]
  shelfBooks: TalebookBook[]
  randomBooks: TalebookBook[]
  newBooks: TalebookBook[]
  isLoading: boolean
  error: string | null
  lastHomeFetchAt: number

  setServer: (server: TalebookServerConfig | null) => void
  setError: (e: string | null) => void
  logout: () => void
  loadHome: (force?: boolean) => Promise<void>
  loadDetail: (bookId: number) => Promise<TalebookBookDetail | null>
  toggleShelf: (bookId: number, inShelf: boolean) => Promise<boolean>
  login: (mode: TalebookLoginMode, fields: { code?: string; username?: string; password?: string }) => Promise<{ ok: boolean; error?: string }>
  refreshUserInfo: () => Promise<void>
  initWithService: (service: ServiceConfig) => Promise<void>
}

const HOME_TTL = 5 * 60 * 1000  // 5 分钟
const USER_INFO_TTL = 5 * 60 * 1000

function normalizeFromService(svc: ServiceConfig): TalebookServerConfig {
  const url = svc.url || ''
  // 旧 calibre service 兼容
  return {
    id: svc.id,
    name: svc.name || 'Talebook',
    url,
    loginMode: svc.apiKey ? 'code' : (svc.username ? 'password' : 'guest'),
    username: svc.username || '',
    password: svc.password || '',
    accessCode: svc.apiKey || '',
  }
}

export const useTalebookStore = create<TalebookState>((set, get) => ({
  server: null,
  userInfo: null,
  readingBooks: [],
  shelfBooks: [],
  randomBooks: [],
  newBooks: [],
  isLoading: false,
  error: null,
  lastHomeFetchAt: 0,

  setServer: (server) => set({ server }),
  setError: (error) => set({ error }),
  logout: () => set({
    server: get().server ? { ...get().server!, cookie: undefined, nickname: undefined, serverVersion: undefined } : null,
    userInfo: null,
    readingBooks: [],
    shelfBooks: [],
    randomBooks: [],
    newBooks: [],
    error: null,
  }),

  initWithService: async (service) => {
    const cached = await getCached<TalebookServerConfig>(`server:${service.id}`)
    let server = cached ?? normalizeFromService(service)
    if (!cached) await setCached(`server:${service.id}`, server, 0)
    set({ server, error: null })
    // 若未登录且配置了账号/访问码，自动登录，避免每次都要在 tab 里点「登录」
    if (!server.cookie && server.loginMode) {
      await get().login(server.loginMode, {
        code: server.accessCode,
        username: server.username,
        password: server.password,
      })
      server = get().server ?? server
    }
    // 自动探测登录态
    try {
      const info = await talebookGetUserInfo(server)
      if (info.ok && info.info) {
        server = { ...server, serverVersion: info.info.serverVersion || server.serverVersion, nickname: info.info.nickname || server.nickname }
        set({ server, userInfo: info.info })
        await setCached(`server:${service.id}`, server, 0)
      }
    } catch {}
    // 登录/探测完成后立即拉取一次首屏（书架等），避免进入时为空、要再进出才有
    const final = get().server
    if (final?.cookie) {
      void get().loadHome(true)
    }
  },

  login: async (mode, fields) => {
    const server = get().server
    if (!server || !server.url) return { ok: false, error: '请先配置服务器地址' }
    set({ isLoading: true, error: null })
    let result
    if (mode === 'code') {
      if (!fields.code) { set({ isLoading: false }); return { ok: false, error: '请输入访问码' } }
      result = await talebookLoginWithCode(server, fields.code)
    } else if (mode === 'password') {
      if (!fields.username || !fields.password) { set({ isLoading: false }); return { ok: false, error: '请输入账号和密码' } }
      result = await talebookLoginWithPassword(server, fields.username, fields.password)
    } else {
      result = await talebookLoginAsGuest(server)
    }
    if (!result.ok) {
      set({ isLoading: false, error: result.error })
      return { ok: false, error: result.error }
    }
    const updated: TalebookServerConfig = {
      ...server,
      cookie: result.cookie,
      nickname: result.nickname,
      loginMode: mode,
      username: mode === 'password' ? (fields.username ?? server.username) : server.username,
      password: mode === 'password' ? (fields.password ?? server.password) : server.password,
      accessCode: mode === 'code' ? (fields.code ?? server.accessCode) : server.accessCode,
    }
    set({ server: updated, isLoading: false })
    await setCached(`server:${server.id}`, updated, 0)
    // 探测用户信息（含版本号）
    void get().refreshUserInfo()
    return { ok: true }
  },

  refreshUserInfo: async () => {
    const server = get().server
    if (!server) return
    const info = await talebookGetUserInfo(server)
    if (info.ok && info.info) {
      const updated = { ...server, serverVersion: info.info.serverVersion || server.serverVersion, nickname: info.info.nickname || server.nickname }
      set({ server: updated, userInfo: info.info })
      await setCached(`server:${server.id}`, updated, 0)
    }
  },

  loadHome: async (force) => {
    const server = get().server
    if (!server || !server.url) return
    const now = Date.now()
    // 未登录时不记入节流缓存，避免「先空、登录后再拉」被 30s 节流挡住
    if (!force && get().lastHomeFetchAt && now - get().lastHomeFetchAt < 30_000 && server.cookie) return
    set({ isLoading: true, error: null })

    // 公开模块
    const indexRes = await talebookGetIndex(server)
    const random = indexRes.ok ? indexRes.data?.randomBooks ?? [] : []
    const fresh = indexRes.ok ? indexRes.data?.newBooks ?? [] : []
    if (!indexRes.ok) {
      set({ error: indexRes.error ?? '加载失败' })
    }

    // 登录模块
    let reading: TalebookBook[] = []
    let shelf: TalebookBook[] = []
    let loadedLoggedIn = false
    if (server.cookie) {
      const [readingRes, shelfRes] = await Promise.all([
        talebookGetReading(server),
        talebookGetShelf(server),
      ])
      reading = readingRes.ok ? readingRes.books ?? [] : []
      shelf = shelfRes.ok ? shelfRes.books ?? [] : []
      loadedLoggedIn = readingRes.ok && shelfRes.ok
    }

    set({
      randomBooks: random,
      newBooks: fresh,
      readingBooks: reading,
      shelfBooks: shelf,
      isLoading: false,
      lastHomeFetchAt: loadedLoggedIn ? now : get().lastHomeFetchAt,
    })
  },

  loadDetail: async (bookId) => {
    const server = get().server
    if (!server) return null
    const result = await talebookGetBookDetail(server, bookId)
    if (!result.ok || !result.book) return null
    return result.book
  },

  toggleShelf: async (bookId, inShelf) => {
    const server = get().server
    if (!server || !server.cookie) return false
    const result = await talebookToggleShelf(server, bookId, inShelf)
    if (result.ok) {
      set({ shelfBooks: get().shelfBooks })
    }
    return result.ok
  },
}))

export async function loadTalebookHomeCached(server: TalebookServerConfig): Promise<TalebookIndexData | null> {
  return getCached<TalebookIndexData>(`home:${server.id}`)
}

export async function saveTalebookHomeCache(server: TalebookServerConfig, data: TalebookIndexData): Promise<void> {
  await setCached(`home:${server.id}`, data, HOME_TTL)
}
