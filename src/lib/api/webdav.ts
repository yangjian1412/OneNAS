import type { WebDavConfig } from '@/types'

export type { WebDavConfig }

export interface WebDavFile {
  path: string        // 完整 URL 或相对路�?  href: string
  name: string
  isDir: boolean
  size: number
  modified?: string
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function utf8Encode(str: string): number[] {
  const bytes: number[] = []
  for (let i = 0; i < str.length; i++) {
    let code = str.codePointAt(i)!
    if (code > 0xffff) i++
    if (code < 0x80) bytes.push(code)
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
  }
  return bytes
}

function toBase64(bytes: number[]): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined
    const n = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0)
    out += B64[(n >> 18) & 63]
    out += B64[(n >> 12) & 63]
    out += b1 === undefined ? '=' : B64[(n >> 6) & 63]
    out += b2 === undefined ? '=' : B64[n & 63]
  }
  return out
}

function authHeader(server: WebDavConfig): string {
  // RN 的 Hermes 引擎没有 unescape/btoa（直接抛错），这里用自实现 UTF-8 → Base64
  const raw = `${server.username}:${server.password}`
  return 'Basic ' + toBase64(utf8Encode(raw))
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

export async function webDavPing(server: WebDavConfig): Promise<WebDavPingResult> {
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

export async function webDavList(server: WebDavConfig, path = ''): Promise<WebDavFile[]> {
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

export async function webDavMkdir(server: WebDavConfig, path: string): Promise<boolean> {
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

export async function webDavDelete(server: WebDavConfig, path: string): Promise<boolean> {
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

export async function webDavMove(server: WebDavConfig, from: string, to: string): Promise<boolean> {
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

export async function webDavCopy(server: WebDavConfig, from: string, to: string): Promise<boolean> {
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

export async function webDavUpload(server: WebDavConfig, remotePath: string, data: Blob | string, contentType = 'application/octet-stream'): Promise<boolean> {
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
