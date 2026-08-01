import { apiFetch } from './client'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  AudiobookshelfLibrary,
  AudiobookshelfLibraryItem,
  AudiobookshelfPlaybackSession,
  AudiobookshelfProgress,
  AudiobookshelfServerConfig,
  AudiobookshelfShelf,
  AudiobookshelfSearchResults,
  AudiobookshelfUser,
  ServiceConfig,
} from '@/types'

const CACHE_PREFIX = 'audiobookshelf:api:'

const CACHE_TTL = {
  serverInfo: 86400000,
  libraries: 300000,
  resume: 30000,
  libraryItems: 60000,
  shelf: 300000,
  itemDetail: 300000,
  session: 120000,
}

const memCache: Map<string, { data: any; expires: number }> = new Map()

async function getCached<T>(key: string): Promise<T | null> {
  if (memCache.has(key)) {
    const entry = memCache.get(key)!
    if (entry.expires > Date.now()) {
      return entry.data as T
    }
    memCache.delete(key)
  }
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.expires && parsed.expires > Date.now()) {
      memCache.set(key, parsed)
      return parsed.data as T
    }
    return null
  } catch {
    return null
  }
}

async function setCached<T>(key: string, data: T, ttl: number): Promise<void> {
  const entry = { data, expires: Date.now() + ttl }
  memCache.set(key, entry)
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry))
  } catch {}
}

export async function clearAudiobookshelfCache(): Promise<void> {
  memCache.clear()
  try {
    const keys = await AsyncStorage.getAllKeys()
    const absKeys = keys.filter((k: string) => k.startsWith(CACHE_PREFIX))
    if (absKeys.length) await AsyncStorage.multiRemove(absKeys)
  } catch {}
}

// ===== Auth =====

export async function audiobookshelfLogin(
  serverUrl: string,
  username: string,
  password: string
): Promise<{ ok: boolean; server?: AudiobookshelfServerConfig; user?: AudiobookshelfUser; serverVersion?: string; error?: string }> {
  try {
    const url = serverUrl.replace(/\/+$/, '')
    const fullUrl = url.replace(/\/$/, '') + '/login'
    const result = await apiFetch<any>(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!result.ok) {
      return { ok: false, error: result.error ?? 'Network error' }
    }
    const data = result.data
    if (!data?.user?.token) {
      return { ok: false, error: '登录失败：未返回 token' }
    }
    const server: AudiobookshelfServerConfig = {
      id: 'audiobookshelf',
      name: 'Audiobookshelf',
      url: serverUrl.replace(/\/$/, ''),
      username,
      password,
      token: data.user.token,
      userId: data.user.id,
      userName: data.user.username,
      serverVersion: data.serverSettings?.version,
    }
    return {
      ok: true,
      server,
      user: data.user,
      serverVersion: data.serverSettings?.version,
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '登录失败' }
  }
}

export async function audiobookshelfAuthorize(
  server: AudiobookshelfServerConfig
): Promise<{ ok: boolean; server?: AudiobookshelfServerConfig; user?: AudiobookshelfUser; serverVersion?: string; error?: string }> {
  if (!server.token) return { ok: false, error: 'no token' }
  try {
    const result = await apiFetch<any>(`${server.url}/api/authorize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${server.token}`,
      },
    })
    if (!result.ok) {
      return { ok: false, error: result.error ?? 'Network error' }
    }
    const data = result.data
    if (!data?.user?.token) {
      return { ok: false, error: 'token 无效' }
    }
    const newServer: AudiobookshelfServerConfig = {
      ...server,
      token: data.user.token,
      userId: data.user.id,
      userName: data.user.username,
      serverVersion: data.serverSettings?.version,
    }
    return {
      ok: true,
      server: newServer,
      user: data.user,
      serverVersion: data.serverSettings?.version,
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '验证失败' }
  }
}

// ===== Library =====

export async function audiobookshelfGetLibraries(
  server: AudiobookshelfServerConfig
): Promise<{ ok: boolean; libraries?: AudiobookshelfLibrary[]; error?: string }> {
  if (!server.token) return { ok: false, error: '未登录' }
  const cacheKey = 'libraries'
  const cached = await getCached<AudiobookshelfLibrary[]>(cacheKey)
  if (cached) return { ok: true, libraries: cached }
  try {
    const result = await apiFetch<any>(`${server.url}/api/libraries`, {
      headers: { Authorization: `Bearer ${server.token}` },
    })
    if (!result.ok) return { ok: false, error: result.error ?? '获取媒体库失败' }
    const libs: AudiobookshelfLibrary[] = result.data?.libraries ?? []
    await setCached(cacheKey, libs, CACHE_TTL.libraries)
    return { ok: true, libraries: libs }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '获取媒体库失败' }
  }
}

// ===== Continue listening =====

export async function audiobookshelfGetResume(
  server: AudiobookshelfServerConfig,
  limit = 12
): Promise<{ ok: boolean; items?: AudiobookshelfLibraryItem[]; error?: string }> {
  if (!server.token) return { ok: false, error: '未登录' }
  const cacheKey = 'resume'
  const cached = await getCached<AudiobookshelfLibraryItem[]>(cacheKey)
  if (cached) return { ok: true, items: cached }
  try {
    const result = await apiFetch<any>(
      `${server.url}/api/me/items-in-progress?limit=${limit}`,
      { headers: { Authorization: `Bearer ${server.token}` } }
    )
    if (!result.ok) return { ok: false, error: result.error ?? '获取继续收听失败' }
    const items: AudiobookshelfLibraryItem[] = result.data?.libraryItems ?? []
    await setCached(cacheKey, items, CACHE_TTL.resume)
    return { ok: true, items }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '获取继续收听失败' }
  }
}

// ===== Library items =====

export async function audiobookshelfGetLibraryItems(
  server: AudiobookshelfServerConfig,
  libraryId: string,
  opts: {
    limit?: number
    page?: number
    sort?: string
    desc?: boolean
    minified?: boolean
  } = {}
): Promise<{ ok: boolean; items?: AudiobookshelfLibraryItem[]; total?: number; error?: string }> {
  if (!server.token) return { ok: false, error: '未登录' }
  const limit = opts.limit ?? 50
  const page = opts.page ?? 0
  const sort = opts.sort ?? 'media.metadata.title'
  const desc = opts.desc ?? false
  const minified = opts.minified ?? true
  const cacheKey = `libraryItems:${libraryId}:${sort}:${desc ? 1 : 0}:${page}`
  try {
    const params = `limit=${limit}&page=${page}&sort=${encodeURIComponent(sort)}&desc=${desc ? 1 : 0}&minified=${minified}`
    const result = await apiFetch<any>(
      `${server.url}/api/libraries/${libraryId}/items?${params}`,
      { headers: { Authorization: `Bearer ${server.token}` } }
    )
    if (!result.ok) return { ok: false, error: result.error ?? '获取媒体库内容失败' }
    const items: AudiobookshelfLibraryItem[] = result.data?.results ?? []
    const total: number = result.data?.total ?? 0
    await setCached(cacheKey, { items, total }, CACHE_TTL.libraryItems)
    return { ok: true, items, total }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '获取媒体库内容失败' }
  }
}

export async function audiobookshelfGetRecentlyAdded(
  server: AudiobookshelfServerConfig,
  libraryId: string,
  limit = 10
): Promise<{ ok: boolean; items?: AudiobookshelfLibraryItem[]; error?: string }> {
  if (!server.token) return { ok: false, error: '未登录' }
  try {
    const result = await audiobookshelfGetLibraryItems(server, libraryId, {
      limit,
      page: 0,
      sort: 'addedAt',
      desc: true,
      minified: true,
    })
    if (!result.ok) return { ok: false, error: result.error }
    return { ok: true, items: result.items }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '获取最近添加失败' }
  }
}

// ===== Item details =====

export async function audiobookshelfGetItem(
  server: AudiobookshelfServerConfig,
  itemId: string,
  expanded = true
): Promise<{ ok: boolean; item?: AudiobookshelfLibraryItem; error?: string }> {
  if (!server.token) return { ok: false, error: '未登录' }
  const cacheKey = `itemDetail:${itemId}:${expanded ? 1 : 0}`
  const cached = await getCached<AudiobookshelfLibraryItem>(cacheKey)
  if (cached) return { ok: true, item: cached }
  try {
    const params = expanded ? '?expanded=1&include=progress' : '?expanded=0'
    const result = await apiFetch<any>(
      `${server.url}/api/items/${itemId}${params}`,
      { headers: { Authorization: `Bearer ${server.token}` } }
    )
    if (!result.ok) return { ok: false, error: result.error ?? '获取详情失败' }
    const item: AudiobookshelfLibraryItem = result.data
    await setCached(cacheKey, item, CACHE_TTL.itemDetail)
    return { ok: true, item }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '获取详情失败' }
  }
}

// ===== Search =====

export async function audiobookshelfSearch(
  server: AudiobookshelfServerConfig,
  libraryId: string,
  query: string,
  limit = 12
): Promise<{ ok: boolean; results?: AudiobookshelfSearchResults; error?: string }> {
  if (!server.token) return { ok: false, error: '未登录' }
  if (!query.trim()) return { ok: true, results: {} }
  try {
    const result = await apiFetch<any>(
      `${server.url}/api/libraries/${libraryId}/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      { headers: { Authorization: `Bearer ${server.token}` } }
    )
    if (!result.ok) return { ok: false, error: result.error ?? '搜索失败' }
    return { ok: true, results: result.data ?? {} }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '搜索失败' }
  }
}

// ===== Cover =====

export function audiobookshelfGetCoverUrl(
  server: AudiobookshelfServerConfig,
  itemId: string,
  width = 400
): string {
  return `${server.url}/api/items/${itemId}/cover?width=${width}`
}

// ===== Playback session =====

export async function audiobookshelfPlayItem(
  server: AudiobookshelfServerConfig,
  itemId: string,
  episodeId?: string
): Promise<{ ok: boolean; session?: AudiobookshelfPlaybackSession; error?: string }> {
  if (!server.token) return { ok: false, error: '未登录' }
  try {
    const url = episodeId
      ? `${server.url}/api/items/${itemId}/play/${episodeId}`
      : `${server.url}/api/items/${itemId}/play`
    const result = await apiFetch<any>(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${server.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deviceInfo: {
          clientVersion: '1.0.0',
          clientName: 'One NAS',
          deviceId: 'one-nas-android',
        },
        supportedMimeTypes: ['audio/flac', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/x-m4a', 'audio/x-wav', 'audio/aac'],
        mediaPlayer: 'html5',
      }),
    })
    if (!result.ok) return { ok: false, error: result.error ?? '获取播放会话失败' }
    const session: AudiobookshelfPlaybackSession = result.data
    return { ok: true, session }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '获取播放会话失败' }
  }
}

// ===== Progress =====

export async function audiobookshelfUpdateProgress(
  server: AudiobookshelfServerConfig,
  itemId: string,
  episodeId: string | undefined,
  payload: { currentTime: number; duration: number; isFinished?: boolean }
): Promise<{ ok: boolean; progress?: AudiobookshelfProgress; error?: string }> {
  if (!server.token) return { ok: false, error: '未登录' }
  try {
    const url = episodeId
      ? `${server.url}/api/me/progress/${itemId}/${episodeId}`
      : `${server.url}/api/me/progress/${itemId}`
    const result = await apiFetch<any>(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${server.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!result.ok) return { ok: false, error: result.error ?? '更新进度失败' }
    return { ok: true, progress: result.data }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '更新进度失败' }
  }
}

export async function audiobookshelfDeleteProgress(
  server: AudiobookshelfServerConfig,
  itemId: string,
  episodeId?: string
): Promise<{ ok: boolean; error?: string }> {
  if (!server.token) return { ok: false, error: '未登录' }
  try {
    const url = episodeId
      ? `${server.url}/api/me/progress/${itemId}/${episodeId}`
      : `${server.url}/api/me/progress/${itemId}`
    const result = await apiFetch<any>(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${server.token}` },
    })
    if (!result.ok) return { ok: false, error: result.error ?? '删除进度失败' }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '删除进度失败' }
  }
}

// ===== Personalized shelves (home page) =====

export async function audiobookshelfGetPersonalized(
  server: AudiobookshelfServerConfig,
  libraryId: string,
  limit = 10
): Promise<{ ok: boolean; shelves?: AudiobookshelfShelf<any>[]; error?: string }> {
  if (!server.token) return { ok: false, error: '未登录' }
  try {
    const result = await apiFetch<any>(
      `${server.url}/api/libraries/${libraryId}/personalized?limit=${limit}`,
      { headers: { Authorization: `Bearer ${server.token}` } }
    )
    if (!result.ok) return { ok: false, error: result.error ?? '获取个性化推荐失败' }
    return { ok: true, shelves: result.data ?? [] }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '获取个性化推荐失败' }
  }
}

// ===== Service init helper =====

export async function initAudiobookshelfFromService(
  service: ServiceConfig
): Promise<{ ok: boolean; server?: AudiobookshelfServerConfig; error?: string }> {
  if (!service.url || !service.username || !service.password) {
    return { ok: false, error: 'Missing URL, username or password' }
  }
  const result = await audiobookshelfLogin(service.url, service.username, service.password)
  if (!result.ok || !result.server) return { ok: false, error: result.error ?? '登录失败' }
  return { ok: true, server: result.server }
}