export interface ApiResult<T> {
  ok: boolean
  data?: T
  error?: string
}

const TIMEOUT_MS = 15000

async function timeoutSignal(): Promise<AbortSignal> {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), TIMEOUT_MS)
  return controller.signal
}

async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<ApiResult<T>> {
  try {
    const signal = await timeoutSignal()
    const response = await fetch(url, { ...options, signal })
    const text = await response.text()
    if (!response.ok) {
      const body = text ? text.slice(0, 300) : ''
      return { ok: false, error: `${response.status} ${response.statusText}${body ? `: ${body}` : ''}` }
    }
    const data = text ? JSON.parse(text) : null
    return { ok: true, data }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Network error' }
  }
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