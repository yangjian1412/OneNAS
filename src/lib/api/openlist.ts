import type { OpenListServerConfig, OpenListFile } from '@/types'

export { type OpenListServerConfig }

async function call<T>(server: OpenListServerConfig, endpoint: string, body: Record<string, unknown> = {}): Promise<T> {
  const url = `${server.url.replace(/\/+$/, '')}/api/${endpoint.replace(/^\//, '')}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (server.token) headers['Authorization'] = server.token
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as { code: number; message: string; data: T }
  if (json.code !== 200) throw new Error(json.message || `code ${json.code}`)
  return json.data
}

export interface OpenListPingResult {
  ok: boolean
  error?: string
}

export async function openListPing(server: OpenListServerConfig): Promise<OpenListPingResult> {
  // 优先用公开端点 /public/settings 检测连通性，无需 token
  try {
    const url = `${server.url.replace(/\/+$/, '')}/api/public/settings`
    const res = await fetch(url)
    if (res.ok) return { ok: true }
  } catch {}
  // fallback: 尝试 fs/list '/'（需要 token 或访客权限）
  try {
    await call<unknown>(server, 'fs/list', { path: '/' })
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown' }
  }
}

export async function openListList(server: OpenListServerConfig, path: string, password = ''): Promise<OpenListFile[]> {
  try {
    const data = await call<{ content: OpenListFile[] }>(server, 'fs/list', { path, password })
    return data.content ?? []
  } catch {
    return []
  }
}

export async function openListGet(server: OpenListServerConfig, path: string, password = ''): Promise<OpenListFile | null> {
  try {
    return await call<OpenListFile>(server, 'fs/get', { path, password })
  } catch {
    return null
  }
}

export async function openListMkdir(server: OpenListServerConfig, path: string): Promise<boolean> {
  try { await call(server, 'fs/mkdir', { path }); return true } catch { return false }
}

export async function openListRemove(server: OpenListServerConfig, paths: string[], dir = false): Promise<boolean> {
  try { await call(server, 'fs/remove', { names: paths, dir }); return true } catch { return false }
}

export async function openListRename(server: OpenListServerConfig, path: string, newName: string): Promise<boolean> {
  try { await call(server, 'fs/rename', { path, name: newName }); return true } catch { return false }
}

export function openListGetFileUrl(server: OpenListServerConfig, path: string, sign?: string): string {
  const base = server.url.replace(/\/+$/, '')
  const q = sign ? `?sign=${encodeURIComponent(sign)}` : ''
  return `${base}/d/${encodeURI(path)}${q}`
}