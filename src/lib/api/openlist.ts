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
  try {
    const url = `${server.url.replace(/\/+$/, '')}/api/public/settings`
    const res = await fetch(url)
    if (res.ok) return { ok: true }
  } catch {}
  try {
    await call<unknown>(server, 'fs/list', { path: '/' })
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown' }
  }
}

export interface OpenListLoginResult {
  ok: boolean
  token?: string
  error?: string
}

export async function openListLogin(server: OpenListServerConfig): Promise<OpenListLoginResult> {
  if (!server.username || !server.password) return { ok: false, error: '未配置用户名或密码' }
  try {
    const data = await call<{ token: string }>(server, 'auth/login', {
      username: server.username,
      password: server.password,
    })
    if (data.token) return { ok: true, token: data.token }
    return { ok: false, error: '登录失败：未返回 token' }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '登录失败' }
  }
}

export async function openListList(server: OpenListServerConfig, path: string, password = ''): Promise<OpenListFile[]> {
  const data = await call<{ content: OpenListFile[] }>(server, 'fs/list', { path, password })
  return data.content ?? []
}

export async function openListGet(server: OpenListServerConfig, path: string, password = ''): Promise<OpenListFile | null> {
  return await call<OpenListFile>(server, 'fs/get', { path, password })
}

export async function openListMkdir(server: OpenListServerConfig, path: string): Promise<void> {
  await call(server, 'fs/mkdir', { path })
}

export async function openListRemove(server: OpenListServerConfig, dir: string, names: string[]): Promise<void> {
  await call(server, 'fs/remove', { dir, names })
}

export async function openListRename(server: OpenListServerConfig, path: string, newName: string): Promise<void> {
  await call(server, 'fs/rename', { path, name: newName, overwrite: false })
}

export async function openListMove(server: OpenListServerConfig, srcDir: string, names: string[], dstDir: string): Promise<void> {
  await call(server, 'fs/move', { src_dir: srcDir, dst_dir: dstDir, names, overwrite: false })
}

export async function openListCopy(server: OpenListServerConfig, srcDir: string, names: string[], dstDir: string): Promise<void> {
  await call(server, 'fs/copy', { src_dir: srcDir, dst_dir: dstDir, names, overwrite: false, skip_existing: false })
}

export interface OpenListUploadAsset {
  uri: string
  name: string
  size: number
  mimeType?: string
}

/** multipart 表单上传，File-Path 需 URL 编码（服务端会 PathUnescape） */
export async function openListFormUpload(server: OpenListServerConfig, remotePath: string, asset: OpenListUploadAsset, asTask = false): Promise<void> {
  const url = `${server.url.replace(/\/+$/, '')}/api/fs/form`
  const headers: Record<string, string> = {
    'File-Path': encodeURI(remotePath),
  }
  if (server.token) headers['Authorization'] = server.token
  if (asTask) headers['As-Task'] = 'true'
  const form = new FormData()
  form.append('file', { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/octet-stream' } as any)
  const res = await fetch(url, { method: 'POST', headers, body: form })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json().catch(() => null)) as { code?: number; message?: string } | null
  if (json && json.code !== 200) throw new Error(json.message || `code ${json.code}`)
}

export function openListGetFileUrl(server: OpenListServerConfig, path: string, sign?: string): string {
  const base = server.url.replace(/\/+$/, '')
  const segs = path.split('/').filter(Boolean).map((s) => encodeURIComponent(s)).join('/')
  const q = sign ? `?sign=${encodeURIComponent(sign)}` : ''
  return `${base}/d/${segs}${q}`
}