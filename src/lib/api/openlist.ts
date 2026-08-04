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

/** /p/ 代理 URL：返回 302 重定向到真实存储 URL，绕过 /d/ 在某些 alist 版本上的 panic */
export function openListGetProxyUrl(server: OpenListServerConfig, path: string, sign?: string): string {
  const base = server.url.replace(/\/+$/, '')
  const segs = path.split('/').filter(Boolean).map((s) => encodeURIComponent(s)).join('/')
  const q = sign ? `?sign=${encodeURIComponent(sign)}` : ''
  return `${base}/p/${segs}${q}`
}

export interface OpenListResolvedFile {
  /** 推荐 URL：raw_url 优先（alist 内部真实存储 URL，绕开 /d//p/ panic），其次 /p/，最后 /d/ */
  url: string
  /** 备用 /p/ URL */
  proxyUrl: string
  /** 备用 /d/ URL */
  directUrl: string
  /** alist 返回的 sign */
  sign?: string
  /** alist 返回的 raw_url（如果有） */
  rawUrl?: string
  /** 来自 fs/get 的元数据 */
  meta?: OpenListFile
}

/** 通过 fs/get 获取文件元数据，返回多级 fallback 的可用 URL */
export async function openListResolveFileUrl(server: OpenListServerConfig, path: string): Promise<OpenListResolvedFile> {
  const directUrl = openListGetFileUrl(server, path)
  const proxyUrl = openListGetProxyUrl(server, path)
  let sign: string | undefined
  let rawUrl: string | undefined
  let meta: OpenListFile | undefined
  try {
    // fs/get 偶发挂起时也要能超时返回（fallback 用 /p/ /d/ 纯直链）
    const r = await Promise.race([
      openListGet(server, path),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('fs/get timeout')), 8000)),
    ])
    meta = r ?? undefined
    if (meta?.sign) sign = meta.sign
    // alist v3 fs/get 响应可能含 raw_url（存储源真实 URL）；类型未声明，运行时取一下
    const m = meta as any
    if (m?.raw_url) rawUrl = String(m.raw_url)
    if (!sign && m?.url) {
      // alist 返回的 url 可能是 /d/{path}?sign=...，从中提 sign
      try {
        const u = new URL(m.url)
        const s = u.searchParams.get('sign')
        if (s) sign = s
      } catch {}
    }
  } catch {}
  const url = rawUrl || proxyUrl || directUrl
  return { url, proxyUrl, directUrl, sign, rawUrl, meta }
}