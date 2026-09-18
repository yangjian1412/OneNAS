import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type {
  TalebookServerConfig,
  TalebookBook,
  TalebookBookDetail,
  TalebookIndexData,
  TalebookLoginMode,
  TalebookUserInfo,
  ServiceConfig,
  GeetestParams,
} from '@/types'
import {
  talebookLoginWithPassword,
  talebookLoginAsGuest,
  talebookGetUserInfo,
  talebookGetIndex,
  talebookGetReading,
  talebookGetShelf,
  talebookGetBookDetail,
  talebookToggleShelf,
  talebookUnlockSite,
  talebookGetCaptchaConfig,
  talebookGetCaptchaImage,
} from '@/lib/api/talebook'
import { getCached, setCached } from '@/lib/api/talebookCache'

interface TalebookState {
  server: TalebookServerConfig | null
  userInfo: TalebookUserInfo | null
  readingBooks: TalebookBook[]
  shelfBooks: TalebookBook[]
  randomBooks: TalebookBook[]
  newBooks: TalebookBook[]
  recentBooks: TalebookBook[]
  isLoading: boolean
  error: string | null
  lastHomeFetchAt: number

  // 验证码/极验相关状态
  captchaType: 'image' | 'geetest' | 'none' | 'loading'
  captchaImageBase64: string
  captchaCode: string
  geetest: GeetestParams | null
  showGeetestHint: boolean
  captchaScene: 'welcome' | 'login'
  unlockHint: string | null
  pendingUnlock: boolean

  setServer: (server: TalebookServerConfig | null) => void
  setError: (e: string | null) => void
  logout: () => void
  initRecent: (serviceId: string) => Promise<void>
  addRecent: (book: TalebookBook, serviceId: string) => Promise<void>
  loadHome: (force?: boolean) => Promise<void>
  loadDetail: (bookId: number) => Promise<TalebookBookDetail | null>
  toggleShelf: (bookId: number, inShelf: boolean) => Promise<boolean>
  login: (mode: TalebookLoginMode, fields: { code?: string; username?: string; password?: string; captchaCode?: string; geetest?: GeetestParams }) => Promise<{ ok: boolean; error?: string }>
  refreshUserInfo: () => Promise<void>
  initWithService: (service: ServiceConfig) => Promise<void>
  initServerFromService: (service: ServiceConfig) => Promise<void>

  // 验证码/极验相关方法
  setCaptchaCode: (code: string) => void
  setGeetest: (geetest: GeetestParams) => void
  dismissGeetestHint: () => void
  refreshCaptcha: () => Promise<void>
  fetchCaptchaConfig: () => Promise<void>
  fetchCaptchaImage: () => Promise<void>
  unlockSite: (fields: { accessCode: string; captchaCode?: string; geetest?: GeetestParams }) => Promise<{ ok: boolean; error?: string }>
  setCaptchaScene: (scene: 'welcome' | 'login') => void
  clearUnlockHint: () => void
}

const HOME_TTL = 5 * 60 * 1000
const USER_INFO_TTL = 5 * 60 * 1000
const RECENT_KEY_PREFIX = 'talebook:recent:'
const RECENT_MAX = 10

function recentKey(serviceId: string) {
  return RECENT_KEY_PREFIX + serviceId
}

function normalizeFromService(svc: ServiceConfig): TalebookServerConfig {
  const url = svc.url || ''
  return {
    id: svc.id,
    name: svc.name || 'Talebook',
    url,
    loginMode: svc.username ? 'password' : 'guest',
    username: svc.username || '',
    password: svc.password || '',
    accessCode: svc.apiKey || '',
    serverType: svc.serverType === 'mybooks' ? 'mybooks' : 'talebook',
  }
}

export const useTalebookStore = create<TalebookState>((set, get) => ({
  server: null,
  userInfo: null,
  readingBooks: [],
  shelfBooks: [],
  randomBooks: [],
  newBooks: [],
  recentBooks: [],
  isLoading: false,
  error: null,
  lastHomeFetchAt: 0,

  // 验证码/极验状态
  captchaType: 'none',
  captchaImageBase64: '',
  captchaCode: '',
  geetest: null,
  showGeetestHint: false,
  captchaScene: 'login',
  unlockHint: null,
  pendingUnlock: false,

  setServer: (server) => set({ server }),
  setError: (error) => set({ error }),
  logout: () => set({
    server: get().server ? { ...get().server!, cookie: undefined, nickname: undefined, serverVersion: undefined } : null,
    userInfo: null,
    readingBooks: [],
    shelfBooks: [],
    randomBooks: [],
    newBooks: [],
    recentBooks: [],
    error: null,
    captchaType: 'none',
    captchaImageBase64: '',
    captchaCode: '',
    geetest: null,
    showGeetestHint: false,
    captchaScene: 'login',
    unlockHint: null,
    pendingUnlock: false,
  }),

  initRecent: async (serviceId) => {
    try {
      const raw = await AsyncStorage.getItem(recentKey(serviceId))
      const books = raw ? JSON.parse(raw) as TalebookBook[] : []
      set({ recentBooks: Array.isArray(books) ? books.slice(0, RECENT_MAX) : [] })
    } catch {
      set({ recentBooks: [] })
    }
  },

  addRecent: async (book, serviceId) => {
    const list = [...get().recentBooks]
    list.splice(0, list.length, book, ...list.filter((b) => b.id !== book.id))
    const next = list.slice(0, RECENT_MAX)
    set({ recentBooks: next })
    try {
      await AsyncStorage.setItem(recentKey(serviceId), JSON.stringify(next))
    } catch {}
  },

  initWithService: async (service) => {
    const cached = await getCached<TalebookServerConfig>(`server:${service.id}`)
    let server = cached ?? normalizeFromService(service)
    if (!cached) await setCached(`server:${service.id}`, server, 0)
    set({ server, error: null })

    // 探测验证码配置（不依赖 cookie，login 前就知道是否需要人机验证）
    await get().fetchCaptchaConfig()

    // 若未登录且配置了账号/密码，自动登录
    if (!server.cookie && server.loginMode === 'password' && server.username && server.password) {
      await get().login('password', {
        username: server.username,
        password: server.password,
      })
      server = get().server ?? server
    } else if (!server.cookie && server.loginMode === 'guest') {
      await get().login('guest', {})
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
    // 登录/探测完成后立即拉取一次首屏
    const final = get().server
    if (final?.cookie) {
      void get().loadHome(true)
    }
  },

  // 仅同步 server 配置 + 探测验证码，不自动登录（用于 ConfigModal 保存服务器设置后）
  initServerFromService: async (service) => {
    const cached = await getCached<TalebookServerConfig>(`server:${service.id}`)
    const server = cached ?? normalizeFromService(service)
    if (!cached) await setCached(`server:${service.id}`, server, 0)
    set({ server, error: null })
    await get().fetchCaptchaConfig()
  },

  login: async (mode, fields) => {
    const server = get().server
    if (!server || !server.url) return { ok: false, error: '请先配置服务器地址' }
    set({ isLoading: true, error: null })
    let result

    const captchaCode = fields.captchaCode ?? get().captchaCode
    const geetest = fields.geetest ?? get().geetest

    if (mode === 'password') {
      if (!fields.username || !fields.password) { set({ isLoading: false }); return { ok: false, error: '请输入账号和密码' } }
      result = await talebookLoginWithPassword(server, fields.username, fields.password, captchaCode, geetest)
    } else {
      result = await talebookLoginAsGuest(server, captchaCode, geetest)
    }
    if (!result.ok) {
      set({ isLoading: false, error: result.error })
      if (get().captchaType === 'image') {
        await get().fetchCaptchaImage()
      }
      return { ok: false, error: result.error }
    }
    const updated: TalebookServerConfig = {
      ...server,
      cookie: result.cookie,
      nickname: result.nickname,
      loginMode: mode,
      username: mode === 'password' ? (fields.username ?? server.username) : server.username,
      password: mode === 'password' ? (fields.password ?? server.password) : server.password,
      accessCode: server.accessCode,
      // 清除验证码相关状态
      captchaCode: '',
      geetest: null,
      captchaType: 'none',
      captchaImageBase64: '',
      showGeetestHint: false,
      captchaScene: 'login',
      unlockHint: null,
      pendingUnlock: false,
    }
    set({ server: updated, isLoading: false })
    await setCached(`server:${server.id}`, updated, 0)
    // 探测用户信息（含版本号）
    void get().refreshUserInfo()
    return { ok: true }
  },

  // 站点解锁（私有模式）
  unlockSite: async (fields) => {
    const server = get().server
    if (!server || !server.url) return { ok: false, error: '请先配置服务器地址' }
    set({ isLoading: true, error: null, pendingUnlock: true })
    const captchaCode = fields.captchaCode ?? get().captchaCode
    const geetest = fields.geetest ?? get().geetest

    const result = await talebookUnlockSite(server, fields.accessCode, captchaCode, geetest)
    if (!result.ok) {
      set({ isLoading: false, error: result.error, pendingUnlock: false })
      if (get().captchaType === 'image') {
        await get().fetchCaptchaImage()
      }
      return { ok: false, error: result.error }
    }
    const updated: TalebookServerConfig = {
      ...server,
      cookie: result.cookie,
      nickname: result.nickname,
      loginMode: server.loginMode,
      username: server.username,
      accessCode: fields.accessCode,
      // 解锁成功后，检查是否需要登录验证码
      captchaCode: '',
      geetest: null,
      captchaType: 'none',
      captchaImageBase64: '',
      showGeetestHint: false,
      captchaScene: 'login',
      unlockHint: '站点已解锁，请输入登录验证码',
      pendingUnlock: false,
    }
    set({ server: updated, isLoading: false })
    await setCached(`server:${server.id}`, updated, 0)
    // 探测登录验证码类型
    void get().fetchCaptchaConfig()
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

  // 验证码/极验相关方法
  setCaptchaCode: (code) => set({ captchaCode: code, error: null }),
  setGeetest: (geetest) => set({ geetest, error: null }),
  dismissGeetestHint: () => set({ showGeetestHint: false }),
  clearUnlockHint: () => set({ unlockHint: null }),

  setCaptchaScene: (scene) => set({ captchaScene: scene }),

  fetchCaptchaConfig: async () => {
    const server = get().server
    if (!server) return
    const result = await talebookGetCaptchaConfig(server)
    if (result.ok) {
      set({ captchaType: result.type })
      if (result.type === 'image') {
        await get().fetchCaptchaImage()
      } else if (result.type === 'geetest') {
        set({ showGeetestHint: true })
      }
    }
  },

  fetchCaptchaImage: async () => {
    const server = get().server
    if (!server) return
    const result = await talebookGetCaptchaImage(server)
    if (result.ok) {
      set({ captchaImageBase64: result.imageBase64, captchaCode: '' })
    }
  },

  refreshCaptcha: async () => {
    if (get().captchaType !== 'image') return
    await get().fetchCaptchaImage()
  },

  loadHome: async (force) => {
    const server = get().server
    if (!server || !server.url) return
    const now = Date.now()
    if (!force && get().lastHomeFetchAt && now - get().lastHomeFetchAt < 30_000 && server.cookie) return
    set({ isLoading: true, error: null })

    const indexRes = await talebookGetIndex(server)
    const random = indexRes.ok ? indexRes.data?.randomBooks ?? [] : []
    const fresh = indexRes.ok ? indexRes.data?.newBooks ?? [] : []
    if (!indexRes.ok) {
      set({ error: indexRes.error ?? '加载失败' })
    }

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