import type { QBittorrentServerConfig, QBitTorrentTask } from '@/types'
import { qbFetch } from '@/lib/qb/nativeAuth'

export { type QBittorrentServerConfig }

// 提取 Set-Cookie 中的 SID 值。
// qBittorrent 的 cookie 命名在不同版本 / 多端口场景下有变化：
//  - 老版本：SID=xxx
//  - 多端口（端口名出现在 cookie 名）：QBT_SID_<port>=xxx，例如 QBT_SID_8080=xxx
// 我们的请求可能经过多个代理，Set-Cookie 也可能被重复/合并成 "a=1;SID=x;HttpOnly, b=2;QBT_SID_8080=y"
// 所以正则同时匹配 SID= 和 QBT_SID_<port>=，取第一个匹配项；返回时仍以原样带回（带 HttpOnly 等属性由服务端控制）。
function extractSid(headers: Record<string, string> | undefined): string | null {
  if (!headers) return null
  const raw = headers['set-cookie'] || headers['Set-Cookie']
  if (!raw) return null
  // 先按逗号拆（多个 Set-Cookie 合并后用 ", " 分隔），再按分号拆
  const cookies = raw.split(/, (?=[^;]+=)/)
  for (const c of cookies) {
    const pair = c.split(';')[0].trim()
    if (/^(QBT_)?SID(_[A-Za-z0-9]+)?=/.test(pair)) {
      return pair
    }
  }
  // 兜底：宽松匹配，找任何 *_SID_xxx= 风格
  const m = raw.match(/((?:QBT_)?SID[^=]*)=([^;,]+)/)
  if (m) return `${m[1]}=${m[2]}`
  return null
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
  // 用原生 OkHttp 走，Set-Cookie 才会被带回 JS（RN XHR/fetch 不暴露 Set-Cookie）
  const res = await qbFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: server.url,
    },
    body: form.toString(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} login failed`)
  // qBittorrent 登录成功响应：
  //  - 早期版本：200 + body "Ok." + Set-Cookie
  //  - 4.6+：204 + 空 body + Set-Cookie
  // 只要拿到 SID cookie 就视为成功（不再依赖 body 内容）
  const sid = extractSid(res.headers)
  if (!sid) {
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

  const res = await qbFetch<any>(url, {
    method: opts.method ?? 'GET',
    headers,
    body,
  })
  if (!res.ok) {
    if (res.status === 403) throw new Error('auth failed (403)')
    throw new Error(`HTTP ${res.status}`)
  }
  try {
    return res.body ? (JSON.parse(res.body) as T) : (undefined as T)
  } catch (e: any) {
    throw new Error(`JSON parse failed: ${e?.message ?? e}`)
  }
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
    // 永远拉 filter=all，避开 qB 服务端 filter 对 stopped* 等非标准状态的排除。
    // 客户端按 state 字段重新分桶——这样无论 qB 是哪个版本/魔改，app 都能正确归类。
    const tasks = await call<QBitTorrentTask[]>(server, 'torrents/info?filter=all')
    return filterTasksByTab(tasks, filter)
  } catch (e: any) {
    if (String(e?.message ?? '').includes('403')) cookieCache.delete(server.id)
    return []
  }
}

/**
 * 客户端按 tab 类型分桶。state 集合按 qB 4.6/5.x 各 filter 的并集 + stopped* 等魔改状态：
 *   downloading → downloading, forcedDL, metaDL, stalledDL
 *   paused      → pausedDL, pausedUP, stopped, stoppedDL, stoppedUP, stopping, pausing
 *                 （"暂停"和"停止"在 qB 是两个独立动作，但用户视角都是"非活跃"，合并显示）
 *   completed   → uploading, forcedUP, stalledUP, pausedUP, stoppedUP（已完成可能还在上传）
 *   all         → 不过滤
 */
function filterTasksByTab(tasks: QBitTorrentTask[], filter: 'all' | 'downloading' | 'completed' | 'paused'): QBitTorrentTask[] {
  if (filter === 'all' || !filter) return tasks
  const allow: Record<string, string[]> = {
    downloading: ['downloading', 'forceddl', 'metadl', 'stalleddl'],
    paused: ['pauseddl', 'pausedup', 'stopped', 'stoppeddl', 'stoppedup', 'stopping', 'pausing'],
    completed: ['uploading', 'forcedup', 'stalledup', 'pausedup', 'stoppedup'],
  }
  const set = allow[filter]
  if (!set) return tasks
  return tasks.filter((t) => set.includes((t.state ?? '').toLowerCase()))
}

export async function qbitAddUrl(server: QBittorrentServerConfig, urls: string[], savePath?: string): Promise<boolean> {
  try {
    const cookie = await ensureSession(server)
    const form: Record<string, string> = { urls: urls.join('\n') }
    if (savePath) form.savepath = savePath
    const res = await qbFetch(`${server.url.replace(/\/+$/, '')}/api/v2/torrents/add`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: server.url,
      },
      body: new URLSearchParams(form).toString(),
    })
    return res.ok && res.body.trim() === 'Ok.'
  } catch {
    return false
  }
}

export async function qbitAction(server: QBittorrentServerConfig, action: 'pause' | 'resume' | 'delete' | 'recheck' | 'reannounce', hashes: string[], deleteFiles = false): Promise<boolean> {
  try {
    const form: Record<string, string> = { hashes: hashes.join('|') }
    if (action === 'delete') form.deleteFiles = deleteFiles ? 'true' : 'false'
    // 标准 qB 用 torrents/pause + torrents/resume；
    // 某些新版/魔改版用的是 torrents/stop + torrents/start（Web UI 才有"停止"按钮）。
    // 先试标准名，404 则 fallback。
    const endpoints = actionEndpointCandidates(action)
    let lastErr: any = null
    for (const ep of endpoints) {
      try {
        await call<any>(server, ep, { method: 'POST', form })
        if (ep !== `torrents/${action}`) rememberEndpoint(action, ep)
        return true
      } catch (e: any) {
        lastErr = e
        const msg = String(e?.message ?? '')
        if (!msg.includes('404')) throw e
      }
    }
    throw lastErr ?? new Error(`no endpoint worked for ${action}`)
  } catch {
    return false
  }
}

/** 候选 endpoint 顺序：标准 qB 名在前，新版/魔改名在后 */
function actionEndpointCandidates(action: 'pause' | 'resume' | 'delete' | 'recheck' | 'reannounce'): string[] {
  if (endpointCache.has(action)) {
    return [endpointCache.get(action)!, `torrents/${action}`]
  }
  switch (action) {
    case 'pause':  return ['torrents/pause', 'torrents/stop']
    case 'resume': return ['torrents/resume', 'torrents/start']
    default:       return [`torrents/${action}`]
  }
}

const endpointCache = new Map<string, string>()
function rememberEndpoint(action: string, ep: string) {
  endpointCache.set(action, ep)
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
    const res = await qbFetch(url, {
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