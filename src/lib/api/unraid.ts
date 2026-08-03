import { apiGraphQL, buildUrl, ApiResult } from './client'
import { Container, DashboardData, VM, UnraidArray, UnraidDisk, ServerConfig } from '@/types'

const DASHBOARD_QUERY = `{
  info { os { hostname uptime } cpu { brand cores threads speed } }
  metrics { cpu { percentTotal } memory { total free available percentTotal } }
  array { state capacity { disks { free used total } } parities { name device size status temp fsSize fsUsed fsFree type } disks { name device size status temp fsSize fsUsed fsFree type } caches { name device size status temp fsSize fsUsed fsFree type } }
  docker { containers { id names state status } }
  vms { domain { id name state } }
}`

const DOCKER_LIST = `{ docker { containers { id names image state status autoStart } } }`
const START = `mutation($id: PrefixedID!) { docker { startContainer(id: $id) { state } } }`
const STOP = `mutation($id: PrefixedID!) { docker { stopContainer(id: $id) { state } } }`
const RESTART = `mutation($id: PrefixedID!) { docker { restartContainer(id: $id) { state } } }`
const VM_START = `mutation($id: String!) { vm { start(id: $id) } }`
const VM_STOP = `mutation($id: String!) { vm { stop(id: $id) } }`
const VM_RESTART = `mutation($id: String!) { vm { reboot(id: $id) } }`
const VM_PAUSE = `mutation($id: String!) { vm { pause(id: $id) } }`
const VM_RESUME = `mutation($id: String!) { vm { resume(id: $id) } }`
const GET_CONTAINER_DETAIL = `query($id: PrefixedID!) { docker { container(id: $id) { id names image state status command created mounts autoStart } } }`

interface DashboardRes {
  info: { os: { hostname: string; uptime: string }; cpu: { brand: string; cores: number; threads: number; speed: number } }
  metrics: { cpu: { percentTotal: number }; memory: { total: number; free: number; available: number; percentTotal: number } }
  array: {
    state: string
    capacity: { disks: { free: string; used: string; total: string } }
    parities: any[]
    disks: any[]
    caches: any[]
  } | null
  docker: { containers: any[] }
  vms: { domain: any[] | null } | null
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
    isSpinning: false,
    rotational: true,
    fsSize: d.fsSize,
    fsUsed: d.fsUsed,
    fsFree: d.fsFree,
    type: d.type,
  }
}

function mapArray(a: any): UnraidArray | null {
  if (!a) return null
  return {
    state: a.state ?? '',
    capacity: a.capacity ?? { disks: { free: '0', used: '0', total: '0' } },
    parities: (a.parities ?? []).map((d: any) => ({ ...mapDisk(d), type: (d.type ?? 'parity') as any })),
    disks: (a.disks ?? []).map((d: any) => ({ ...mapDisk(d), type: (d.type ?? 'data') as any })),
    caches: (a.caches ?? []).map((d: any) => ({ ...mapDisk(d), type: (d.type ?? 'cache') as any })),
  }
}

function mapVM(v: any): VM {
  return {
    id: v.id ?? v.name ?? '',
    name: v.name ?? '',
    state: v.state ?? '',
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
  const memTotal = d.metrics?.memory?.total ?? 0
  const memAvail = d.metrics?.memory?.available ?? 0
  return {
    ok: true,
    data: {
      hostname: d.info?.os?.hostname ?? '',
      uptime: d.info?.os?.uptime ?? '',
      cpuModel: d.info?.cpu?.brand ?? '',
      cpuCores: d.info?.cpu?.cores ?? 0,
      cpuThreads: d.info?.cpu?.threads ?? 0,
      cpuSpeed: d.info?.cpu?.speed ?? 0,
      cpuPercent: d.metrics?.cpu?.percentTotal ?? 0,
      memoryTotal: memTotal,
      memoryUsed: memTotal - memAvail,
      memoryFree: memAvail,
      memoryPercent: d.metrics?.memory?.percentTotal ?? 0,
      array: mapArray(d.array),
      containers: (d.docker?.containers ?? []).map(mapContainer),
      vms: Array.isArray(d.vms?.domain) ? d.vms!.domain.map(mapVM) : [],
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

async function vmMutation(server: ServerConfig, query: string, id: string): Promise<ApiResult<any>> {
  return apiGraphQL(buildUnraidUrl(server), query, { id: id.replace('v/', '') }, server.apiKey)
}
export function startVM(server: ServerConfig, id: string) { return vmMutation(server, VM_START, id) }
export function stopVM(server: ServerConfig, id: string) { return vmMutation(server, VM_STOP, id) }
export function restartVM(server: ServerConfig, id: string) { return vmMutation(server, VM_RESTART, id) }
export function pauseVM(server: ServerConfig, id: string) { return vmMutation(server, VM_PAUSE, id) }
export function resumeVM(server: ServerConfig, id: string) { return vmMutation(server, VM_RESUME, id) }

export async function fetchContainerDetail(server: ServerConfig, id: string): Promise<ApiResult<any>> {
  const url = buildUnraidUrl(server)
  return apiGraphQL(url, GET_CONTAINER_DETAIL, { id }, server.apiKey)
}
