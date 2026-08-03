import type { WebDavServerConfig, ServerConfig } from '@/types'

export { type WebDavServerConfig }

// 把 ServerConfig 转成 WebDavServerConfig
export function serverToWebDav(server: ServerConfig): WebDavServerConfig {
  const proto = server.protocol === 'https' ? 'https' : 'http'
  const port = server.port ? `:${server.port}` : ''
  let path = ''
  if (server.apiKey) path = server.apiKey // 把 "API Key" 字段当作额外 path 后缀使用（可选）
  const url = `${proto}://${server.host}${port}${path}`.replace(/\/+$/, '')
  return {
    id: server.id,
    name: server.name,
    url,
    username: server.username || '',
    password: server.password || '',
  }
}

export interface WebDavFile {
  path: string        // 完整 URL 或相对路径
  href: string
  name: string
  isDir: boolean
  size: number
  modified?: string
}

function authHeader(server: WebDavServerConfig): string {
  // RN 没有 global Buffer；用 btoa（latin1 安全编码，Basic Auth 通用即可）
  const raw = `${server.username}:${server.password}`
  let b64 = ''
  try { b64 = globalThis.btoa(unescape(encodeURIComponent(raw))) } catch { b64 = '' }
  return 'Basic ' + b64
}

function joinPath(base: string, sub: string): string {
  if (!sub) return base.replace(/\/+$/, '') + '/'
  const b = base.replace(/\/+$/, '') + '/'
  return b + sub.split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

export interface WebDavPingResult {
  ok: boolean
  error?: string
}

export async function webDavPing(server: WebDavServerConfig): Promise<WebDavPingResult> {
  try {
    const res = await fetch(server.url, {
      method: 'PROPFIND',
      headers: { Authorization: authHeader(server), Depth: '0', 'Content-Type': 'application/xml' },
    })
    if (res.status === 401 || res.status === 403) return { ok: false, error: '认证失败' }
    if (!res.ok && res.status !== 207) return { ok: false, error: `HTTP ${res.status}` }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown' }
  }
}

export async function webDavList(server: WebDavServerConfig, path = ''): Promise<WebDavFile[]> {
  const url = joinPath(server.url, path)
  const res = await fetch(url, {
    method: 'PROPFIND',
    headers: { Authorization: authHeader(server), Depth: '1', 'Content-Type': 'application/xml' },
  })
  if (res.status === 404) return []
  if (!res.ok && res.status !== 207) throw new Error(`HTTP ${res.status}`)
  const xml = await res.text()
  return parsePropfindResponse(xml, server.url)
}

function parsePropfindResponse(xml: string, base: string): WebDavFile[] {
  const files: WebDavFile[] = []
  const re = /<response\b[^>]*>([\s\S]*?)<\/response>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const block = m[1]
    const hrefMatch = block.match(/<href>([^<]+)<\/href>/)
    if (!hrefMatch) continue
    const href = decodeURIComponent(hrefMatch[1])
    if (href === base || href === base + '/') continue
    const name = href.replace(/\/+$/, '').split('/').filter(Boolean).pop() || ''
    if (!name) continue
    const isCollection = /<resourcetype>\s*<collection\b/i.test(block)
    const sizeMatch = block.match(/<getcontentlength>\s*(\d+)\s*<\/getcontentlength>/i)
    const size = isCollection ? 0 : Number(sizeMatch?.[1] ?? 0)
    const modMatch = block.match(/<getlastmodified>\s*([^<]+)\s*<\/getlastmodified>/i)
    files.push({ path: href, href, name, isDir: isCollection, size, modified: modMatch?.[1] })
  }
  return files
}

export async function webDavMkdir(server: WebDavServerConfig, path: string): Promise<boolean> {
  try {
    const url = joinPath(server.url, path).replace(/\/+$/, '')
    const res = await fetch(url, {
      method: 'MKCOL',
      headers: { Authorization: authHeader(server) },
    })
    return res.ok || res.status === 405
  } catch {
    return false
  }
}

export async function webDavDelete(server: WebDavServerConfig, path: string): Promise<boolean> {
  try {
    const url = joinPath(server.url, path)
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: authHeader(server) },
    })
    return res.ok
  } catch {
    return false
  }
}

export async function webDavMove(server: WebDavServerConfig, from: string, to: string): Promise<boolean> {
  try {
    const fromUrl = joinPath(server.url, from)
    const toUrl = joinPath(server.url, to)
    const res = await fetch(fromUrl, {
      method: 'MOVE',
      headers: { Authorization: authHeader(server), Destination: toUrl, Overwrite: 'T' },
    })
    return res.ok
  } catch {
    return false
  }
}

export async function webDavCopy(server: WebDavServerConfig, from: string, to: string): Promise<boolean> {
  try {
    const fromUrl = joinPath(server.url, from)
    const toUrl = joinPath(server.url, to)
    const res = await fetch(fromUrl, {
      method: 'COPY',
      headers: { Authorization: authHeader(server), Destination: toUrl, Overwrite: 'T' },
    })
    return res.ok
  } catch {
    return false
  }
}

export async function webDavUpload(server: WebDavServerConfig, remotePath: string, data: Blob | string, contentType = 'application/octet-stream'): Promise<boolean> {
  try {
    const url = joinPath(server.url, remotePath)
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: authHeader(server), 'Content-Type': contentType },
      body: data,
    })
    return res.ok
  } catch {
    return false
  }
}