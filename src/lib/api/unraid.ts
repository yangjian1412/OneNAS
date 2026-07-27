import { apiGraphQL, buildUrl, ApiResult } from './client'
import { Container, DashboardData, VM, UnraidArray, UnraidDisk, ServerConfig } from '@/types'

const DASHBOARD_QUERY = `{
  docker { containers { names state status } }
}`

const DOCKER_LIST = `{ docker { containers { names state status } } }`
const START = `mutation($id: String!) { docker { startContainer(id: $id) { state } } }`
const STOP = `mutation($id: String!) { docker { stopContainer(id: $id) { state } } }`
const RESTART = `mutation($id: String!) { docker { restartContainer(id: $id) { state } } }`

interface DashboardRes {
  online: boolean
  info: { os: { hostname: string; uptime: string }; cpu: { model: string; cores: number; threads: number } }
  metrics: { cpu: { percentTotal: number }; memory: { total: number; used: number; free: number; percentTotal: number } }
  array: { state: string; capacity: { kilobytes: { free: number; used: number; total: number } }; disks: any[] } | null
  docker: { containers: any[] }
  vms: { domains: any[] } | null
}

function mapContainer(c: any): Container {
  return {
    id: c.id ?? c.names?.[0] ?? '',
    names: c.names ?? [],
    image: c.image ?? '',
    state: c.state ?? '',
    status: c.status ?? '',
    autoStart: c.autoStart ?? false,
    ports: '',
  }
}

function mapDisk(d: any): UnraidDisk {
  return {
    name: d.name ?? '',
    device: d.device ?? '',
    size: d.size ?? 0,
    temp: d.temp ?? 0,
    status: d.status ?? '',
    isSpinning: d.isSpinning ?? false,
  }
}

function mapArray(a: any): UnraidArray | null {
  if (!a) return null
  return {
    state: a.state ?? '',
    capacity: a.capacity ?? { kilobytes: { free: 0, used: 0, total: 0 } },
    disks: (a.disks ?? []).map(mapDisk),
  }
}

function mapVM(v: any): VM {
  return {
    id: v.name ?? '',
    name: v.name ?? '',
    state: v.state ?? '',
    vcpus: v.vcpus,
    memory: v.memory,
  }
}

function buildUnraidUrl(server: ServerConfig): string {
  return `${buildUrl(server.protocol, server.host, server.port)}/graphql`
}

export async function fetchDashboard(server: ServerConfig): Promise<ApiResult<DashboardData>> {
  const url = buildUnraidUrl(server)
  const result = await apiGraphQL<DashboardRes>(url, DASHBOARD_QUERY, {}, server.apiKey)
  if (!result.ok) return { ok: false, error: result.error }

  const d = result.data!
  return {
    ok: true,
    data: {
      online: d.online ?? false,
      hostname: d.info?.os?.hostname ?? '',
      uptime: d.info?.os?.uptime ?? '',
      cpuModel: d.info?.cpu?.model ?? '',
      cpuCores: d.info?.cpu?.cores ?? 0,
      cpuThreads: d.info?.cpu?.threads ?? 0,
      cpuPercent: d.metrics?.cpu?.percentTotal ?? 0,
      memoryTotal: d.metrics?.memory?.total ?? 0,
      memoryUsed: d.metrics?.memory?.used ?? 0,
      memoryFree: d.metrics?.memory?.free ?? 0,
      memoryPercent: d.metrics?.memory?.percentTotal ?? 0,
      array: mapArray(d.array),
      containers: (d.docker?.containers ?? []).map(mapContainer),
      vms: (d.vms?.domains ?? []).map(mapVM),
    },
  }
}

export async function fetchContainers(server: ServerConfig): Promise<ApiResult<Container[]>> {
  const url = buildUnraidUrl(server)
  const result = await apiGraphQL<{ docker: { containers: any[] } }>(url, DOCKER_LIST, {}, server.apiKey)
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: (result.data?.docker?.containers ?? []).map(mapContainer) }
}

async function containerMutation(server: ServerConfig, query: string, id: string): Promise<ApiResult<any>> {
  return apiGraphQL(buildUnraidUrl(server), query, { id }, server.apiKey)
}

export function startContainer(server: ServerConfig, id: string) { return containerMutation(server, START, id) }
export function stopContainer(server: ServerConfig, id: string) { return containerMutation(server, STOP, id) }
export function restartContainer(server: ServerConfig, id: string) { return containerMutation(server, RESTART, id) }
