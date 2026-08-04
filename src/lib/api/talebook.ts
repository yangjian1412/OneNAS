import type {
  TalebookServerConfig,
  TalebookBook,
  TalebookBookDetail,
  TalebookIndexData,
  TalebookUserInfo,
} from '@/types'
import { apiFetch } from '@/lib/api/client'

export { type TalebookServerConfig }

export type LoginResult =
  | { ok: true; cookie: string; nickname: string; username: string; mode: 'code' | 'password' | 'guest' }
  | { ok: false; error: string }

interface TalebookApiEnvelope {
  err?: string
  msg?: string
  books?: TalebookBook[]
  random_books?: TalebookBook[]
  new_books?: TalebookBook[]
  book?: TalebookBookDetail
  navs?: any[]
  sys?: {
    books?: number
    tags?: number
    authors?: number
    publishers?: number
    series?: number
    version?: string
    title?: string
  }
  user?: {
    is_login?: boolean
    is_admin?: boolean
    nickname?: string
    username?: string
    avatar?: string
  }
}

function baseUrl(server: TalebookServerConfig): string {
  return server.url.replace(/\/+$/, '')
}

function withCookie(headers: Record<string, string>, cookie?: string): Record<string, string> {
  if (cookie) return { ...headers, Cookie: cookie }
  return headers
}

// talebook 后端登录使用 self.get_argument() 解析参数，必须是 form-urlencoded，不能用 JSON
function formBody(fields: Record<string, string>): string {
  const parts: string[] = []
  for (const k of Object.keys(fields)) {
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(fields[k] ?? '')}`)
  }
  return parts.join('&')
}

function extractCookies(headers: Record<string, string> | undefined): string {
  if (!headers) return ''
  // xmlhttprequest 会把所有 set-cookie 合到一行用逗号分隔（部分实现）；通常只有一个
  const setCookie = headers['set-cookie'] || ''
  if (!setCookie) return ''
  // 只取 name=value 部分
  return setCookie
    .split(/,(?=\s*[\w-]+=)/)
    .map((s) => s.split(';')[0].trim())
    .filter(Boolean)
    .join('; ')
}

function normalizeUserInfo(raw: TalebookApiEnvelope): TalebookUserInfo {
  return {
    isLogin: !!raw.user?.is_login,
    isAdmin: !!raw.user?.is_admin,
    nickname: raw.user?.nickname ?? '',
    username: raw.user?.username ?? '',
    serverVersion: raw.sys?.version ?? '',
    bookCount: raw.sys?.books ?? 0,
    title: raw.sys?.title ?? '',
  }
}

// ===== Login =====

export async function talebookLoginWithCode(server: TalebookServerConfig, code: string): Promise<LoginResult> {
  const url = `${baseUrl(server)}/api/welcome`
  const result = await apiFetch<TalebookApiEnvelope>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({ code: code.trim() }),
  })
  if (!result.ok) return { ok: false, error: result.error ?? '登录失败' }
  if (result.data?.err && result.data.err !== 'ok') {
    return { ok: false, error: result.data.msg ?? result.data.err }
  }
  const cookie = extractCookies(result.headers)
  const nickname = result.data?.user?.nickname ?? '访客'
  const username = result.data?.user?.username ?? ''
  return { ok: true, cookie, nickname, username, mode: 'code' }
}

export async function talebookLoginWithPassword(server: TalebookServerConfig, username: string, password: string): Promise<LoginResult> {
  const url = `${baseUrl(server)}/api/user/sign_in`
  const result = await apiFetch<TalebookApiEnvelope>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({
      username: (username || '').trim().toLowerCase(),
      password: password ?? '',
    }),
  })
  if (!result.ok) return { ok: false, error: result.error ?? '登录失败' }
  if (result.data?.err && result.data.err !== 'ok') {
    return { ok: false, error: result.data.msg ?? result.data.err }
  }
  const cookie = extractCookies(result.headers)
  const nickname = result.data?.user?.nickname ?? username
  return { ok: true, cookie, nickname, username, mode: 'password' }
}

export async function talebookLoginAsGuest(server: TalebookServerConfig): Promise<LoginResult> {
  return talebookLoginWithPassword(server, '', '')
}

// ===== Probes =====

export async function talebookGetUserInfo(server: TalebookServerConfig): Promise<{
  ok: boolean
  info?: TalebookUserInfo
  error?: string
}> {
  const url = `${baseUrl(server)}/api/user/info`
  const result = await apiFetch<TalebookApiEnvelope>(url, {
    headers: withCookie({}, server.cookie),
  })
  if (!result.ok) return { ok: false, error: result.error }
  if (result.data?.err && result.data.err !== 'ok') {
    return { ok: false, error: result.data.msg ?? result.data.err }
  }
  return { ok: true, info: normalizeUserInfo(result.data ?? {}) }
}

// ===== Home sections =====

export async function talebookGetIndex(server: TalebookServerConfig): Promise<{
  ok: boolean
  data?: TalebookIndexData
  error?: string
}> {
  const url = `${baseUrl(server)}/api/index?random=12&recent=12`
  const result = await apiFetch<TalebookApiEnvelope>(url, {
    headers: withCookie({}, server.cookie),
  })
  if (!result.ok) return { ok: false, error: result.error }
  if (result.data?.err && result.data.err !== 'ok') {
    return { ok: false, error: result.data.msg ?? result.data.err }
  }
  return {
    ok: true,
    data: {
      randomBooks: result.data?.random_books ?? [],
      newBooks: result.data?.new_books ?? [],
    },
  }
}

export async function talebookGetReading(server: TalebookServerConfig): Promise<{
  ok: boolean
  books?: TalebookBook[]
  error?: string
}> {
  const url = `${baseUrl(server)}/api/reading`
  const result = await apiFetch<TalebookApiEnvelope>(url, {
    headers: withCookie({}, server.cookie),
  })
  if (!result.ok) return { ok: false, error: result.error }
  if (result.data?.err && result.data.err !== 'ok') {
    return { ok: false, error: result.data.msg ?? result.data.err }
  }
  return { ok: true, books: result.data?.books ?? [] }
}

export async function talebookGetRecent(server: TalebookServerConfig): Promise<{
  ok: boolean
  books?: TalebookBook[]
  error?: string
}> {
  const url = `${baseUrl(server)}/api/recent`
  const result = await apiFetch<TalebookApiEnvelope>(url, {
    headers: withCookie({}, server.cookie),
  })
  if (!result.ok) return { ok: false, error: result.error }
  if (result.data?.err && result.data.err !== 'ok') {
    return { ok: false, error: result.data.msg ?? result.data.err }
  }
  return { ok: true, books: result.data?.books ?? [] }
}

export async function talebookGetShelf(server: TalebookServerConfig): Promise<{
  ok: boolean
  books?: TalebookBook[]
  error?: string
}> {
  const url = `${baseUrl(server)}/api/shelf`
  const result = await apiFetch<TalebookApiEnvelope>(url, {
    headers: withCookie({}, server.cookie),
  })
  if (!result.ok) return { ok: false, error: result.error }
  if (result.data?.err && result.data.err !== 'ok') {
    return { ok: false, error: result.data.msg ?? result.data.err }
  }
  return { ok: true, books: result.data?.books ?? [] }
}

export async function talebookSearch(server: TalebookServerConfig, query: string): Promise<{
  ok: boolean
  books?: TalebookBook[]
  error?: string
}> {
  const url = `${baseUrl(server)}/api/search?name=${encodeURIComponent(query.trim())}`
  const result = await apiFetch<TalebookApiEnvelope>(url, {
    headers: withCookie({}, server.cookie),
  })
  if (!result.ok) return { ok: false, error: result.error }
  if (result.data?.err && result.data.err !== 'ok') {
    return { ok: false, error: result.data.msg ?? result.data.err }
  }
  return { ok: true, books: result.data?.books ?? [] }
}

// ===== Book detail =====

export async function talebookGetBookDetail(server: TalebookServerConfig, bookId: number): Promise<{
  ok: boolean
  book?: TalebookBookDetail
  error?: string
}> {
  const url = `${baseUrl(server)}/api/book/${bookId}`
  const result = await apiFetch<TalebookApiEnvelope>(url, {
    headers: withCookie({}, server.cookie),
  })
  if (!result.ok) return { ok: false, error: result.error }
  if (result.data?.err && result.data.err !== 'ok') {
    return { ok: false, error: result.data.msg ?? result.data.err }
  }
  return { ok: true, book: result.data?.book }
}

export async function talebookToggleShelf(server: TalebookServerConfig, bookId: number, inShelf: boolean): Promise<{
  ok: boolean
  error?: string
}> {
  const url = `${baseUrl(server)}/api/book/${bookId}/shelf`
  const result = await apiFetch<TalebookApiEnvelope>(url, {
    method: 'POST',
    headers: { ...withCookie({ 'Content-Type': 'application/json' }, server.cookie) },
    body: JSON.stringify({ shelf: inShelf }),
  })
  if (!result.ok) return { ok: false, error: result.error }
  if (result.data?.err && result.data.err !== 'ok') {
    return { ok: false, error: result.data.msg ?? result.data.err }
  }
  return { ok: true }
}

// ===== URL helpers =====

export function talebookGetCoverUrl(server: TalebookServerConfig, cover: string | undefined, size: number = 300): string | undefined {
  if (!cover) return undefined
  if (cover.startsWith('http')) return cover
  const sep = cover.includes('?') ? '&' : '?'
  return `${baseUrl(server)}${cover.startsWith('/') ? '' : '/'}${cover}${sep}tbsize=${size}`
}

export function talebookGetReadUrl(server: TalebookServerConfig, bookId: number): string {
  return `${baseUrl(server)}/read/${bookId}`
}

export function talebookGetDownloadUrl(server: TalebookServerConfig, href: string): string {
  if (href.startsWith('http')) return href
  const path = href.startsWith('/') ? href : `/${href}`
  return `${baseUrl(server)}${path}`
}
