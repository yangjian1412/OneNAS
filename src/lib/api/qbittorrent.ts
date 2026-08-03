import type { QBittorrentServerConfig, QBitTorrentTask } from '@/types'
import { apiFetch, ApiResult } from '@/lib/api/client'

export { type QBittorrentServerConfig }

// 提取 Set-Cookie 中的 SID 值（容忍多种大小写、空格、逗号分隔）
function extractSid(headers: Record<string, string> | undefined): string | null {
  if (!headers) return null
  const raw = headers['set-cookie'] || headers['Set-Cookie']
  if (!raw) return null
  const m = raw.match(/SID=([^;,]+)/)
  return m ? `SID=${m[1]}` : null
}

// 服务器缓存的 cookie 字符串（按 service.id 区分，避免多服务冲突）
const cookieCache = new Map<string, string>()

async function ensureSession(server: QBittorrentServerConfig): Promise<string> {
  if (server.cookie) return server.cookie
  const cached = cookieCache.get(server.id)
  if (cached) return cached

  const url = `${server.url.replace(/\/+$/, '')}/api/v2/auth/login`
  const form = new URLSearchParams()
  form.set('username', server.username)
  form.set('password', server.password)
  const res = await apiFetch<string>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: server.url,
    },
    body: form.toString(),
  })
  if (!res.ok) throw new Error(res.error || 'login failed')
  // qBittorrent 登录成功响应体就是 "Ok."
  const sid = extractSid(res.headers)
  if (!sid) {
    // 检查 body 是否真的成功（部分版本 Ok 不写 Set-Cookie）
    if (res.data && (res.data as any).toString().trim() !== 'Ok.') {
      throw new Error(`login failed: ${res.data}`)
    }
    throw new Error('login: no SID cookie')
  }
  cookieCache.set(server.id, sid)
  return sid
}

interface QBitCallOptions {
  method?: 'GET' | 'POST'
  form?: Record<string, string>
}

async function call<T>(server: QBittorrentServerConfig, endpoint: string, opts: QBitCallOptions = {}): Promise<T> {
  const cookie = await ensureSession(server)
  const url = `${server.url.replace(/\/+$/, '')}/api/v2/${endpoint.replace(/^\//, '')}`
  const headers: Record<string, string> = { Cookie: cookie, Referer: server.url }

  let body: string | undefined
  if (opts.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(opts.form).toString()
  }

  const res = await apiFetch<any>(url, {
    method: opts.method ?? 'GET',
    headers,
    body,
  })
  if (!res.ok) {
    if (/^401|^403|auth failed/i.test(res.error || '')) throw new Error('auth failed (403)')
    throw new Error(res.error || 'request failed')
  }
  return res.data as T
}

export interface QBitPingResult {
  ok: boolean
  error?: string
}

export async function qbitPing(server: QBittorrentServerConfig): Promise<QBitPingResult> {
  try {
    await ensureSession(server)
    return { ok: true }
  } catch (e: any) {
    cookieCache.delete(server.id)
    return { ok: false, error: e?.message ?? 'unknown' }
  }
}

export async function qbitList(server: QBittorrentServerConfig, filter: 'all' | 'downloading' | 'completed' | 'paused' = 'all'): Promise<QBitTorrentTask[]> {
  try {
    return await call<QBitTorrentTask[]>(server, `torrents/info?filter=${filter}`)
  } catch (e: any) {
    if (String(e?.message ?? '').includes('403')) cookieCache.delete(server.id)
    return []
  }
}

export async function qbitAddUrl(server: QBittorrentServerConfig, urls: string[], savePath?: string): Promise<boolean> {
  try {
    const cookie = await ensureSession(server)
    const form: Record<string, string> = { urls: urls.join('\n') }
    if (savePath) form.savepath = savePath
    const res = await apiFetch<string>(`${server.url.replace(/\/+$/, '')}/api/v2/torrents/add`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: server.url,
      },
      body: new URLSearchParams(form).toString(),
    })
    return res.ok && (res.data as any)?.toString().trim() === 'Ok.'
  } catch {
    return false
  }
}

export async function qbitAction(server: QBittorrentServerConfig, action: 'pause' | 'resume' | 'delete' | 'recheck' | 'reannounce', hashes: string[], deleteFiles = false): Promise<boolean> {
  try {
    const form: Record<string, string> = { hashes: hashes.join('|') }
    if (action === 'delete') form.deleteFiles = deleteFiles ? 'true' : 'false'
    await call(server, `torrents/${action}`, { method: 'POST', form })
    return true
  } catch {
    return false
  }
}

export async function qbitGetPreferences(server: QBittorrentServerConfig): Promise<Record<string, any> | null> {
  try {
    return await call<Record<string, any>>(server, 'app/preferences')
  } catch {
    return null
  }
}

export async function qbitSetPreferences(server: QBittorrentServerConfig, prefs: Record<string, any>): Promise<boolean> {
  try {
    const cookie = await ensureSession(server)
    const json = JSON.stringify(prefs)
    const form = new URLSearchParams({ json }).toString()
    const url = `${server.url.replace(/\/+$/, '')}/api/v2/app/setPreferences`
    const res = await apiFetch<any>(url, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: server.url,
      },
      body: form,
    })
    return res.ok
  } catch {
    return false
  }
}