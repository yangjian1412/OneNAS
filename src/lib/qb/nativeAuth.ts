import { NativeModules } from 'react-native'

const { QbAuthModule } = NativeModules as {
  QbAuthModule?: {
    request: (
      url: string,
      method: string,
      headers: Record<string, string> | null,
      body: string | null,
    ) => Promise<{
      status: number
      body: string
      headers: Record<string, string>
      ok: boolean
    }>
  }
}

export interface QbFetchResult {
  ok: boolean
  status: number
  body: string
  /** 全部响应头（含 Set-Cookie / set-cookie），key 已统一小写 */
  headers: Record<string, string>
}

export interface QbFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  body?: string | null
}

/**
 * 直接走原生 OkHttp 发请求，**Set-Cookie 也会回传**。仅供 qBittorrent 鉴权链路使用。
 * 其它服务（Jellyfin / Navidrome / Emby 等）继续走 `apiFetch`（它们用 Authorization 头，不需要 cookie）。
 *
 * qBittorrent 4.6+ WebAPI 默认开启 CSRF 保护：非 GET 请求必须带 Origin 头，且与 WebUI Host 匹配。
 * OkHttp 不自动写 Origin（浏览器会自动写），所以我们手动从 URL 派生注入——这就是为什么 Web UI 能用、
 * 早期 app 调 POST 没反应（被 CSRF 拦下，try/catch 静默吞错）。
 */
export async function qbFetch(url: string, opts: QbFetchOptions = {}): Promise<QbFetchResult> {
  if (!QbAuthModule) {
    throw new Error('原生 QbAuthModule 不可用（仅 Android 端）')
  }
  const method = (opts.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = { ...(opts.headers ?? {}) }
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    if (!headers.Origin && !headers.origin) {
      try {
        const u = new URL(url)
        headers.Origin = `${u.protocol}//${u.host}`
      } catch { /* ignore: invalid URL, let server reject */ }
    }
  }
  const r = await QbAuthModule.request(
    url,
    method,
    headers,
    opts.body ?? null,
  )
  return {
    ok: r.ok,
    status: r.status,
    body: r.body,
    headers: r.headers,
  }
}