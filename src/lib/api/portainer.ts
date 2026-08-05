import { PortainerConfig, PortainerContainer, PortainerEndpoint, PortainerDashboardData } from '@/types'

const TIMEOUT_MS = 20000

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

function authHeaders(token: string): Record<string, string> {
  // Portainer v1.x: API Key 走 X-Api-Key
  // Portainer v2.x: Access Token (JWT) 走 Authorization: Bearer
  // 两端都带，最大兼容
  return {
    'X-Api-Key': token,
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms = TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function getJson<T>(url: string, token: string): Promise<T> {
  const res = await fetchWithTimeout(url, { method: 'GET', headers: authHeaders(token) })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`)
  }
  return (await res.json()) as T
}

async function postNoBody(url: string, token: string): Promise<void> {
  const res = await fetchWithTimeout(url, { method: 'POST', headers: authHeaders(token) })
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`)
  }
}

// ── Auth 验证 ────────────────────────────────────────────────────────────────

export interface PortainerPingResult {
  ok: boolean
  error?: string
  endpoints?: PortainerEndpoint[]
  version?: string
}

/** 测试可达 + API token 有效，返回 endpoint 列表（v1 取第一个 Docker 类型） */
export async function portainerPing(server: PortainerConfig): Promise<PortainerPingResult> {
  const base = normalizeBaseUrl(server.url)
  // 1) /api/status 不需 auth，验证 URL 可达
  try {
    await fetchWithTimeout(`${base}/api/status`, { method: 'GET' }, 5000)
  } catch (e: any) {
    return { ok: false, error: `无法访问 Portainer: ${e?.message ?? e}` }
  }
  // 2) /api/endpoints 验证 token
  try {
    const endpoints = await getJson<PortainerEndpoint[]>(`${base}/api/endpoints`, server.apiToken)
    return { ok: true, endpoints }
  } catch (e: any) {
    return { ok: false, error: `API Token 无效或无法访问: ${e?.message ?? e}` }
  }
}

/** 选第一个 Docker 类型的 endpoint（v1 简单实现） */
export function pickDefaultEndpoint(endpoints: PortainerEndpoint[]): PortainerEndpoint | null {
  if (!endpoints || endpoints.length === 0) return null
  // Type 1 = Docker；优先选 Docker 类型
  const dockerEp = endpoints.find((e) => e.Type === 1 && e.Status === 1)
  return dockerEp ?? endpoints.find((e) => e.Status === 1) ?? endpoints[0] ?? null
}

// ── Container 操作 ───────────────────────────────────────────────────────────

export async function portainerListContainers(
  server: PortainerConfig,
  endpointId: number,
  opts?: { all?: boolean },
): Promise<PortainerContainer[]> {
  const base = normalizeBaseUrl(server.url)
  const params = new URLSearchParams()
  // 默认 all=true：列出所有容器（含停止的），与 Unraid DockerScreen 一致
  params.set('all', opts?.all === false ? '0' : '1')
  const url = `${base}/api/endpoints/${endpointId}/docker/containers/json?${params.toString()}`
  return await getJson<PortainerContainer[]>(url, server.apiToken)
}

export type ContainerAction = 'start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'kill'

export async function portainerContainerAction(
  server: PortainerConfig,
  endpointId: number,
  containerId: string,
  action: ContainerAction,
): Promise<{ ok: boolean; error?: string }> {
  const base = normalizeBaseUrl(server.url)
  const url = `${base}/api/endpoints/${endpointId}/docker/containers/${containerId}/${action}`
  try {
    await postNoBody(url, server.apiToken)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '操作失败' }
  }
}

export async function portainerInspectContainer(
  server: PortainerConfig,
  endpointId: number,
  containerId: string,
): Promise<any> {
  const base = normalizeBaseUrl(server.url)
  const url = `${base}/api/endpoints/${endpointId}/docker/containers/${containerId}/json`
  return await getJson<any>(url, server.apiToken)
}

// ── Dashboard 聚合 ───────────────────────────────────────────────────────────

/** 一次拉取 endpoint 列表 + 容器列表（v1 简化） */
export async function fetchPortainerDashboard(server: PortainerConfig): Promise<{
  ok: boolean
  data?: PortainerDashboardData
  error?: string
}> {
  const ping = await portainerPing(server)
  if (!ping.ok || !ping.endpoints) {
    return { ok: false, error: ping.error ?? 'Portainer 不可达' }
  }
  const endpoint = pickDefaultEndpoint(ping.endpoints)
  if (!endpoint) {
    return { ok: false, error: '未找到可用的 Docker endpoint' }
  }
  try {
    const containers = await portainerListContainers(server, endpoint.Id)
    return {
      ok: true,
      data: {
        endpointId: endpoint.Id,
        endpointName: endpoint.Name,
        endpointUrl: endpoint.Url,
        containers,
      },
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '拉取容器失败' }
  }
}