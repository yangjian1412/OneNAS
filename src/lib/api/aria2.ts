import type { Aria2ServerConfig, Aria2Task, Aria2GlobalStat, Aria2Version } from '@/types'

export { type Aria2ServerConfig }

let _idCounter = 1
function nextId(): string {
  return `aria2-${Date.now()}-${_idCounter++}`
}

interface RpcResponse<T> {
  id?: string
  jsonrpc?: string
  result?: T
  error?: { code: number; message: string }
}

async function call<T>(server: Aria2ServerConfig, method: string, params: unknown[] = []): Promise<T> {
  const tokenParams = server.secret ? [`token:${server.secret}`, ...params] : params
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: nextId(),
    method: `aria2.${method}`,
    params: tokenParams,
  })
  const res = await fetch(server.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as RpcResponse<T>
  if (json.error) throw new Error(`${json.error.code}: ${json.error.message}`)
  return json.result as T
}

export interface Aria2PingResult {
  ok: boolean
  version?: string
  error?: string
}

export async function aria2Ping(server: Aria2ServerConfig): Promise<Aria2PingResult> {
  try {
    const v = await call<Aria2Version>(server, 'getVersion')
    return { ok: true, version: v.version }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown error' }
  }
}

export async function aria2GetVersion(server: Aria2ServerConfig): Promise<Aria2Version | null> {
  try {
    return await call<Aria2Version>(server, 'getVersion')
  } catch {
    return null
  }
}

export async function aria2GetGlobalStat(server: Aria2ServerConfig): Promise<Aria2GlobalStat | null> {
  try {
    return await call<Aria2GlobalStat>(server, 'getGlobalStat')
  } catch {
    return null
  }
}

export async function aria2TellActive(server: Aria2ServerConfig): Promise<Aria2Task[]> {
  try {
    return (await call<Aria2Task[]>(server, 'tellActive')) ?? []
  } catch {
    return []
  }
}

export async function aria2TellWaiting(server: Aria2ServerConfig, offset = 0, num = 50): Promise<Aria2Task[]> {
  try {
    return (await call<Aria2Task[]>(server, 'tellWaiting', [offset, num])) ?? []
  } catch {
    return []
  }
}

export async function aria2TellStopped(server: Aria2ServerConfig, offset = 0, num = 50): Promise<Aria2Task[]> {
  try {
    return (await call<Aria2Task[]>(server, 'tellStopped', [offset, num])) ?? []
  } catch {
    return []
  }
}

export async function aria2Pause(server: Aria2ServerConfig, gid: string): Promise<boolean> {
  try { await call(server, 'pause', [gid]); return true } catch { return false }
}

export async function aria2Unpause(server: Aria2ServerConfig, gid: string): Promise<boolean> {
  try { await call(server, 'unpause', [gid]); return true } catch { return false }
}

export async function aria2Remove(server: Aria2ServerConfig, gid: string): Promise<boolean> {
  try { await call(server, 'removeDownloadResult', [gid]); return true } catch { return false }
}

export async function aria2ForceRemove(server: Aria2ServerConfig, gid: string): Promise<boolean> {
  try { await call(server, 'forceRemove', [gid]); return true } catch { return false }
}

export async function aria2AddUri(
  server: Aria2ServerConfig,
  uris: string[],
  options: Record<string, string> = {},
): Promise<string> {
  const gid = await call<string>(server, 'addUri', [uris, options])
  if (!gid) throw new Error('aria2 addUri 返回为空')
  return gid
}

export async function aria2TellStatus(
  server: Aria2ServerConfig,
  gid: string,
): Promise<Aria2Task | null> {
  try {
    return await call<Aria2Task>(server, 'tellStatus', [gid])
  } catch {
    return null
  }
}

export async function aria2GetGlobalOption(server: Aria2ServerConfig): Promise<Record<string, string> | null> {
  try {
    return await call<Record<string, string>>(server, 'getGlobalOption')
  } catch {
    return null
  }
}

export async function aria2ChangeGlobalOption(server: Aria2ServerConfig, options: Record<string, string>): Promise<boolean> {
  try { await call(server, 'changeGlobalOption', [options]); return true } catch { return false }
}