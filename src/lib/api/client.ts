export interface ApiResult<T> {
  ok: boolean
  data?: T
  error?: string
  headers?: Record<string, string>
}

const TIMEOUT_MS = 15000

export function apiFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<ApiResult<T>> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest()
      xhr.timeout = TIMEOUT_MS
      xhr.open(options.method || 'GET', url, true)

      const reqHeaders = (options.headers || {}) as Record<string, string>
      Object.keys(reqHeaders).forEach((k) => {
        try { xhr.setRequestHeader(k, reqHeaders[k]) } catch {}
      })

      xhr.ontimeout = () => resolve({ ok: false, error: `请求超时: ${url}` })
      xhr.onerror = () => resolve({ ok: false, error: `网络错误 ${xhr.status}: ${url}` })
      xhr.onabort = () => resolve({ ok: false, error: '请求已取消' })
      xhr.onload = () => {
        const text = xhr.responseText
        const headers: Record<string, string> = {}
        const rawHeaders = xhr.getAllResponseHeaders() || ''
        rawHeaders.split(/\r?\n/).forEach((line) => {
          const idx = line.indexOf(':')
          if (idx > 0) {
            const k = line.slice(0, idx).trim().toLowerCase()
            const v = line.slice(idx + 1).trim()
            if (k) headers[k] = v
          }
        })
        if (xhr.status < 200 || xhr.status >= 300) {
          const st = xhr.statusText || ''
          resolve({ ok: false, error: `${xhr.status}${st ? ` ${st}` : ''} ${url}`, headers })
          return
        }
        try {
          const data = text ? JSON.parse(text) : null
          resolve({ ok: true, data, headers })
        } catch (err: any) {
          resolve({ ok: false, error: err.message || 'JSON 解析失败', headers })
        }
      }

      xhr.send(options.body as any)
    } catch (err: any) {
      resolve({ ok: false, error: err.message || 'Network error' })
    }
  })
}

export async function apiGraphQL<T>(
  url: string,
  query: string,
  variables: Record<string, unknown> = {},
  apiKey?: string,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) headers['x-api-key'] = apiKey
  const hasVars = Object.keys(variables).length > 0
  const raw = await apiFetch<{ data: T; errors?: Array<{ message: string }> }>(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(hasVars ? { query, variables } : { query }),
  })
  if (!raw.ok) return { ok: false, error: raw.error }
  const gql = raw.data!
  if (gql.data == null) {
    return { ok: false, error: (gql.errors ?? []).map((e: any) => e.message).join('; ') }
  }
  return { ok: true, data: gql.data }
}

export function buildUrl(protocol: string, host: string, port: number): string {
  return `${protocol}://${host}:${port}`
}