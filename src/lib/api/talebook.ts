import type {
  TalebookServerConfig,
  TalebookBook,
  TalebookBookDetail,
  TalebookIndexData,
  TalebookUserInfo,
  GeetestParams,
} from '@/types'
import { apiFetch } from '@/lib/api/client'

export { type TalebookServerConfig, type GeetestParams }

export type LoginResult =
  | { ok: true; cookie: string; nickname: string; username: string; mode: 'password' | 'guest' }
  | { ok: false; error: string }

export type UnlockResult =
  | { ok: true; cookie: string; nickname: string; username: string; mode: 'code' }
  | { ok: false; error: string }

export type CaptchaConfigResult =
  | { ok: true; type: 'image' | 'geetest' | 'none'; config?: any }
  | { ok: false; error: string }

export type CaptchaImageResult =
  | { ok: true; imageBase64: string }
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
  const setCookie = headers['set-cookie'] || ''
  if (!setCookie) return ''
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

export async function talebookLoginWithPassword(
  server: TalebookServerConfig,
  username: string,
  password: string,
  captchaCode?: string,
  geetest?: GeetestParams
): Promise<LoginResult> {
  const body: Record<string, string> = {
    username: (username || '').trim().toLowerCase(),
    password: password ?? '',
  }
  if (captchaCode) body.captcha_code = captchaCode
  if (geetest) {
    body.lot_number = geetest.lotNumber
    body.captcha_output = geetest.captchaOutput
    body.pass_token = geetest.passToken
    body.gen_time = geetest.genTime
  }
  const result = await apiFetch<any>(`${baseUrl(server)}/api/user/sign_in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody(body),
  })
  if (!result.ok) return { ok: false, error: result.error ?? '登录失败' }
  if (result.data?.err && result.data.err !== 'ok') {
    return { ok: false, error: result.data.msg ?? result.data.err }
  }
  const cookie = extractCookies(result.headers)
  const nickname = result.data?.user?.nickname ?? username
  return { ok: true, cookie, nickname, username, mode: 'password' }
}

export async function talebookLoginAsGuest(server: TalebookServerConfig, captchaCode?: string, geetest?: GeetestParams): Promise<LoginResult> {
  return talebookLoginWithPassword(server, '', '', captchaCode, geetest)
}

// ===== Private mode site unlock =====

export async function talebookUnlockSite(
  server: TalebookServerConfig,
  siteAccessCode: string,
  captchaCode?: string,
  geetest?: GeetestParams
): Promise<UnlockResult> {
  // MyBooks: POST /api/access，JSON body，字段 invite_code
  if (server.serverType === 'mybooks') {
    const result = await apiFetch<any>(`${baseUrl(server)}/api/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_code: siteAccessCode.trim() }),
    })
    if (!result.ok) return { ok: false, error: result.error ?? '解锁失败' }
    if (result.data?.err && result.data.err !== 'ok' && result.data.err !== 'free') {
      return { ok: false, error: result.data.msg ?? result.data.err }
    }
    const cookie = extractCookies(result.headers)
    const nickname = result.data?.user?.nickname ?? '访客'
    const username = result.data?.user?.username ?? ''
    return { ok: true, cookie, nickname, username, mode: 'code' }
  }
  // Talebook: POST /api/welcome，form-urlencoded，字段 code
  const body: Record<string, string> = { code: siteAccessCode.trim() }
  if (captchaCode) body.captcha_code = captchaCode
  if (geetest) {
    body.lot_number = geetest.lotNumber
    body.captcha_output = geetest.captchaOutput
    body.pass_token = geetest.passToken
    body.gen_time = geetest.genTime
  }
  const result = await apiFetch<any>(`${baseUrl(server)}/api/welcome`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody(body),
  })
  if (!result.ok) return { ok: false, error: result.error ?? '解锁失败' }
  if (result.data?.err && result.data.err !== 'ok' && result.data.err !== 'free') {
    if (result.data.err === 'captcha.invalid') {
      return { ok: false, error: result.data.msg ?? '人机验证失败' }
    }
    return { ok: false, error: result.data.msg ?? result.data.err }
  }
  const cookie = extractCookies(result.headers)
  const nickname = result.data?.user?.nickname ?? '访客'
  const username = result.data?.user?.username ?? ''
  return { ok: true, cookie, nickname, username, mode: 'code' }
}

// ===== Captcha =====

export async function talebookGetCaptchaConfig(server: TalebookServerConfig): Promise<CaptchaConfigResult> {
  // MyBooks 后端无验证码端点
  if (server.serverType === 'mybooks') {
    return { ok: true, type: 'none' }
  }
  const result = await apiFetch<any>(`${baseUrl(server)}/api/captcha/config`, {
    headers: withCookie({}, server.cookie),
  })
  if (!result.ok) return { ok: false, error: result.error ?? '获取验证码配置失败' }
  return { ok: true, type: result.data?.type ?? 'none', config: result.data }
}

export async function talebookGetCaptchaImage(server: TalebookServerConfig): Promise<CaptchaImageResult> {
  if (server.serverType === 'mybooks') {
    return { ok: false, error: 'MyBooks 不支持验证码' }
  }
  const result = await apiFetch<any>(`${baseUrl(server)}/api/captcha/image`, {
    headers: withCookie({}, server.cookie),
  })
  if (!result.ok) return { ok: false, error: result.error ?? '获取验证码图片失败' }
  return { ok: true, imageBase64: result.data?.imageBase64 ?? '' }
}

// ===== Probes =====

export async function talebookGetUserInfo(server: TalebookServerConfig): Promise<{
  ok: boolean
  info?: TalebookUserInfo
  error?: string
}> {
  const url = `${baseUrl(server)}/api/user/info`
  const result = await apiFetch<any>(url, {
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
  const result = await apiFetch<any>(url, {
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
  const result = await apiFetch<any>(url, {
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
  // MyBooks: /api/wants；Talebook: /api/shelf
  const path = server.serverType === 'mybooks' ? '/api/wants' : '/api/shelf'
  const url = `${baseUrl(server)}${path}`
  const result = await apiFetch<any>(url, {
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
  const result = await apiFetch<any>(url, {
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
  const result = await apiFetch<any>(url, {
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
  // MyBooks: /api/book/{id}/wants，body 字段 wants；Talebook: /shelf，body 字段 shelf
  const isMybooks = server.serverType === 'mybooks'
  const path = isMybooks ? `/api/book/${bookId}/wants` : `/api/book/${bookId}/shelf`
  const url = `${baseUrl(server)}${path}`
  const result = await apiFetch<any>(url, {
    method: 'POST',
    headers: { ...withCookie({ 'Content-Type': 'application/json' }, server.cookie) },
    body: JSON.stringify(isMybooks ? { wants: inShelf } : { shelf: inShelf }),
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