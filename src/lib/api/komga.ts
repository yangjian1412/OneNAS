import { KomgaServerConfig, KomgaLibrary, KomgaSeries, KomgaBook, KomgaPage, KomgaBookmark } from '@/types'

// Komga 全部走 Basic auth（user/pass → "user:pass" → base64）
// 每次请求都带 Authorization header（Komga 不需要 cookie/session 持久化）
const TIMEOUT_MS = 20000

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, '')
}

function authHeader(server: KomgaServerConfig): Record<string, string> {
  // Komga 标准 Basic auth：每个请求带 Authorization: Basic <base64("user:pass")>
  const token = utf8ToBase64(`${server.username}:${server.password}`)
  return {
    'Authorization': `Basic ${token}`,
    'Accept': 'application/json',
  }
}

function utf8ToBase64(s: string): string {
  const utf8: number[] = []
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i)
    if (c < 0x80) utf8.push(c)
    else if (c < 0x800) {
      utf8.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    } else if (c < 0xd800 || c >= 0xe000) {
      utf8.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    } else {
      i++
      c = 0x10000 + (((c & 0x3ff) << 10) | (s.charCodeAt(i) & 0x3ff))
      utf8.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    }
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < utf8.length; i += 3) {
    const b1 = utf8[i]
    const b2 = i + 1 < utf8.length ? utf8[i + 1] : 0
    const b3 = i + 2 < utf8.length ? utf8[i + 2] : 0
    out += chars[b1 >> 2]
    out += chars[((b1 & 0x03) << 4) | (b2 >> 4)]
    out += i + 1 < utf8.length ? chars[((b2 & 0x0f) << 2) | (b3 >> 6)] : '='
    out += i + 2 < utf8.length ? chars[b3 & 0x3f] : '='
  }
  return out
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function getJson<T>(url: string, token: string): Promise<T> {
  const res = await fetchWithTimeout(url, { method: 'GET', headers: { Authorization: `Basic ${token}`, Accept: 'application/json' } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`)
  }
  return (await res.json()) as T
}

async function getJsonWithAuth<T>(server: KomgaServerConfig, url: string): Promise<T> {
  const res = await fetchWithTimeout(url, { method: 'GET', headers: authHeader(server) })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`)
  }
  return (await res.json()) as T
}

async function postJson<T>(server: KomgaServerConfig, path: string, body: any): Promise<T> {
  const url = `${normalizeBase(server.url)}${path}`
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { ...authHeader(server), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`)
  }
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}

async function patchJson<T>(server: KomgaServerConfig, path: string, body: any): Promise<T> {
  const url = `${normalizeBase(server.url)}${path}`
  const res = await fetchWithTimeout(url, {
    method: 'PATCH',
    headers: { ...authHeader(server), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`)
  }
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}

async function del(server: KomgaServerConfig, path: string): Promise<void> {
  const url = `${normalizeBase(server.url)}${path}`
  const res = await fetchWithTimeout(url, {
    method: 'DELETE',
    headers: authHeader(server),
  })
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`)
  }
}

// ── Login / Self ────────────────────────────────────────────────────────────────

export interface KomgaUserInfo {
  id: string
  email?: string
  username?: string
  roles?: string[]
  admin?: boolean
  sharedAllLibraries?: boolean
  sharedLibrariesIds?: string[]
}

function extractServerVersion(res: Response): string | undefined {
  // 尝试多个常见 header 提取 Komga 版本号
  const candidates = [
    res.headers.get('X-Komga-Version'),
    res.headers.get('X-Powered-By'),
    res.headers.get('Server'),
  ]
  for (const c of candidates) {
    if (!c) continue
    // 提取 "Komga/1.2.3" 或 "1.2.3" 形式
    const m = c.match(/(\d+\.\d+\.\d+(?:[\-+][\w.]+)?)/)
    if (m) return m[1]
  }
  return undefined
}

export async function komgaGetMe(server: KomgaServerConfig): Promise<KomgaUserInfo> {
  return await getJsonWithAuth<KomgaUserInfo>(server, `${normalizeBase(server.url)}/api/v2/users/me`)
}

// 不需要单独登录，Basic auth 每次请求直接验证
export async function komgaLogin(server: KomgaServerConfig): Promise<{ ok: boolean; error?: string; userName?: string; userId?: string; serverVersion?: string }> {
  try {
    // 直接用 fetch 访问，以便读取 response.headers 拿版本号
    const url = `${normalizeBase(server.url)}/api/v2/users/me`
    const token = utf8ToBase64(`${server.username}:${server.password}`)
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: `Basic ${token}`, Accept: 'application/json' },
    })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const me = (await res.json()) as KomgaUserInfo
    return {
      ok: true,
      userName: me.username ?? me.email,
      userId: me.id,
      serverVersion: extractServerVersion(res),
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '登录失败' }
  }
}

// ── Libraries ────────────────────────────────────────────────────────────────

export async function komgaListLibraries(server: KomgaServerConfig): Promise<KomgaLibrary[]> {
  return await getJsonWithAuth<KomgaLibrary[]>(server, `${normalizeBase(server.url)}/api/v1/libraries`)
}

// ── Series ───────────────────────────────────────────────────────────────────

export interface KomgaPageResp<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

// Series 列表参数（GET /api/v1/series?library_id=...&search=...&sort=...&page=...&size=...）
export interface KomgaSeriesSearch {
  libraryIds?: string[]
  search?: string
  oneshot?: boolean
  sort?: string                       // 形如 'name,asc' 或 'createdDate,desc'（GET query）
  page?: number
  size?: number
}

// Komga 的 sort 字段名（与 metadata.numberSort 等对齐）
export const KOMGA_SERIES_SORTS = ['name', 'createdDate', 'lastModifiedDate', 'booksMetadata.releaseDate', 'booksCount', 'booksReadCount', 'booksUnreadCount', 'booksInProgressCount'] as const

function buildSeriesQuery(s: KomgaSeriesSearch): string {
  const params = new URLSearchParams()
  if (s.libraryIds && s.libraryIds.length > 0) params.set('library_id', s.libraryIds.join(','))
  if (s.search && s.search.trim()) params.set('search', s.search.trim())
  if (s.oneshot !== undefined) params.set('oneshot', s.oneshot ? 'true' : 'false')
  if (s.sort) params.set('sort', s.sort)
  if (s.page !== undefined) params.set('page', String(s.page))
  if (s.size !== undefined) params.set('size', String(s.size))
  return params.toString()
}

export async function komgaListSeries(server: KomgaServerConfig, search: KomgaSeriesSearch = {}): Promise<KomgaSeries[]> {
  const qs = buildSeriesQuery(search)
  const url = `${normalizeBase(server.url)}/api/v1/series${qs ? '?' + qs : ''}`
  const page = await getJsonWithAuth<KomgaPageResp<KomgaSeries>>(server, url)
  return page.content ?? []
}

export async function komgaGetSeries(server: KomgaServerConfig, id: string): Promise<KomgaSeries> {
  return await getJsonWithAuth<KomgaSeries>(server, `${normalizeBase(server.url)}/api/v1/series/${id}`)
}

export async function komgaListNewSeries(server: KomgaServerConfig, libraryIds?: string[], limit = 10): Promise<KomgaSeries[]> {
  const params = new URLSearchParams()
  if (libraryIds && libraryIds.length > 0) params.set('library_id', libraryIds.join(','))
  params.set('limit', String(limit))
  const url = `${normalizeBase(server.url)}/api/v1/series/new?${params.toString()}`
  // /series/new 带 library_id 时返回 Page<Series>，取 content
  const page = await getJsonWithAuth<KomgaPageResp<KomgaSeries>>(server, url)
  return page.content ?? []
}

// ── Books ────────────────────────────────────────────────────────────────────

// Books 列表参数（GET /api/v1/books?library_id=...&series_id=...&search=...&sort=...&page=...&size=...）
export interface KomgaBookSearch {
  libraryIds?: string[]
  seriesId?: string[]
  search?: string
  mediaStatus?: string[]
  readStatus?: ('UNREAD' | 'READ' | 'IN_PROGRESS')[]
  sort?: string                       // 形如 'metadata.numberSort,asc'
  page?: number
  size?: number
}

export const KOMGA_BOOK_SORTS = ['name', 'createdDate', 'lastModifiedDate', 'metadata.numberSort', 'readProgress.readDate', 'size', 'pagesCount'] as const

function buildBookQuery(s: KomgaBookSearch): string {
  const params = new URLSearchParams()
  if (s.libraryIds && s.libraryIds.length > 0) params.set('library_id', s.libraryIds.join(','))
  if (s.seriesId && s.seriesId.length > 0) params.set('series_id', s.seriesId.join(','))
  if (s.search && s.search.trim()) params.set('search', s.search.trim())
  if (s.mediaStatus && s.mediaStatus.length > 0) params.set('media_status', s.mediaStatus.join(','))
  if (s.readStatus && s.readStatus.length > 0) params.set('read_status', s.readStatus.join(','))
  if (s.sort) params.set('sort', s.sort)
  if (s.page !== undefined) params.set('page', String(s.page))
  if (s.size !== undefined) params.set('size', String(s.size))
  return params.toString()
}

export async function komgaListBooks(server: KomgaServerConfig, search: KomgaBookSearch = {}): Promise<KomgaBook[]> {
  const qs = buildBookQuery(search)
  const url = `${normalizeBase(server.url)}/api/v1/books${qs ? '?' + qs : ''}`
  const page = await getJsonWithAuth<KomgaPageResp<KomgaBook>>(server, url)
  return page.content ?? []
}

// 列出某个系列的书（权威接口：series_id query 在部分 Komga 版本被忽略，必须用 /series/{id}/books）
export async function komgaGetSeriesBooks(
  server: KomgaServerConfig,
  seriesId: string,
  opts: { size?: number; sort?: string; page?: number } = {},
): Promise<KomgaBook[]> {
  const params = new URLSearchParams()
  if (opts.sort) params.set('sort', opts.sort)
  if (opts.page !== undefined) params.set('page', String(opts.page))
  if (opts.size !== undefined) params.set('size', String(opts.size))
  const qs = params.toString()
  const url = `${normalizeBase(server.url)}/api/v1/series/${seriesId}/books${qs ? '?' + qs : ''}`
  const page = await getJsonWithAuth<KomgaPageResp<KomgaBook>>(server, url)
  return page.content ?? []
}

export async function komgaGetBook(server: KomgaServerConfig, id: string): Promise<KomgaBook> {
  return await getJsonWithAuth<KomgaBook>(server, `${normalizeBase(server.url)}/api/v1/books/${id}`)
}

export async function komgaGetBookPages(server: KomgaServerConfig, id: string): Promise<KomgaPage[]> {
  return await getJsonWithAuth<KomgaPage[]>(server, `${normalizeBase(server.url)}/api/v1/books/${id}/pages`)
}

export async function komgaOnDeck(server: KomgaServerConfig, libraryIds?: string[], limit = 10): Promise<KomgaBook[]> {
  const params = new URLSearchParams()
  if (libraryIds && libraryIds.length > 0) params.set('library_id', libraryIds.join(','))
  params.set('limit', String(limit))
  // /books/ondeck 返回 Page<BookDto>，取 content
  const page = await getJsonWithAuth<KomgaPageResp<KomgaBook>>(server, `${normalizeBase(server.url)}/api/v1/books/ondeck?${params.toString()}`)
  return page.content ?? []
}

// ── Read Progress ────────────────────────────────────────────────────────────

export async function komgaUpdateReadProgress(server: KomgaServerConfig, bookId: string, payload: { page?: number; completed?: boolean }): Promise<void> {
  await patchJson(server, `/api/v1/books/${bookId}/read-progress`, payload)
}

export async function komgaMarkRead(server: KomgaServerConfig, bookId: string): Promise<void> {
  await komgaUpdateReadProgress(server, bookId, { completed: true })
}

export async function komgaMarkUnread(server: KomgaServerConfig, bookId: string): Promise<void> {
  await del(server, `/api/v1/books/${bookId}/read-progress`)
}

// ── Bookmarks ────────────────────────────────────────────────────────────────

export async function komgaListBookmarks(server: KomgaServerConfig, userId?: string): Promise<KomgaBookmark[]> {
  if (!userId) {
    const me = await komgaGetMe(server)
    userId = me.id
  }
  return await getJsonWithAuth<KomgaBookmark[]>(server, `${normalizeBase(server.url)}/api/v1/users/${userId}/bookmarks`)
}

export async function komgaAddBookmark(server: KomgaServerConfig, bookId: string, page: number, userId?: string): Promise<KomgaBookmark> {
  if (!userId) {
    const me = await komgaGetMe(server)
    userId = me.id
  }
  return await postJson<KomgaBookmark>(server, `/api/v1/users/${userId}/bookmarks`, { bookId, page })
}

export async function komgaDeleteBookmark(server: KomgaServerConfig, bookmarkId: string, userId?: string): Promise<void> {
  if (!userId) {
    const me = await komgaGetMe(server)
    userId = me.id
  }
  await del(server, `/api/v1/users/${userId}/bookmarks/${bookmarkId}`)
}

// ── URL 构造器（直接用 fetch/Image headers 加载，无需走 JS 包装）─────────────

export function komgaThumbUrl(server: KomgaServerConfig, seriesId: string): string {
  return `${normalizeBase(server.url)}/api/v1/series/${seriesId}/thumbnail`
}

export function komgaBookThumbUrl(server: KomgaServerConfig, bookId: string): string {
  return `${normalizeBase(server.url)}/api/v1/books/${bookId}/thumbnail`
}

export function komgaPageUrl(server: KomgaServerConfig, bookId: string, pageNum: number): string {
  return `${normalizeBase(server.url)}/api/v1/books/${bookId}/pages/${pageNum}`
}

export function komgaAuthHeader(server: KomgaServerConfig): Record<string, string> {
  return authHeader(server)
}

// ── 全局搜索（series + books 双 GET） ────────────────────────────────────────

export async function komgaGlobalSearch(server: KomgaServerConfig, query: string): Promise<{ series: KomgaSeries[]; books: KomgaBook[] }> {
  if (!query.trim()) return { series: [], books: [] }
  const q = query.trim()
  // komgaListSeries / komgaListBooks 现在返回解包后的数组
  const [series, books] = await Promise.all([
    komgaListSeries(server, { search: q, size: 20 }),
    komgaListBooks(server, { search: q, size: 20 }),
  ])
  return { series, books }
}