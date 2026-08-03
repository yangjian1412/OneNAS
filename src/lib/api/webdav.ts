import type { WebDavConfig } from '@/types'

export type { WebDavConfig }

export interface WebDavFile {
  path: string        // 规范化后的相对路径（以 / 开头）
  href: string        // 服务端返回的原始 href
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

export function webDavAuthHeader(server: WebDavConfig): string {
  const raw = `${server.username}:${server.password}`
  return 'Basic ' + toBase64(utf8Encode(raw))
}

// 规范化"路径"为以 / 开头的相对路径，并去掉末尾斜杠
export function normalizeRelativePath(p: string): string {
  let out = p
  // 是 URL → 提取 pathname
  if (/^https?:\/\//i.test(out)) {
    try { out = new URL(out).pathname } catch {}
  }
  if (!out.startsWith('/')) out = '/' + out
  out = out.replace(/\/+$/, '')
  return out || '/'
}

// 把相对路径拼到 base url 后，每段路径单独 encodeURIComponent
export function joinDavUrl(base: string, sub: string): string {
  const b = base.replace(/\/+$/, '')
  const norm = normalizeRelativePath(sub)
  const segs = norm.split('/').filter(Boolean).map(encodeURIComponent).join('/')
  return segs ? `${b}/${segs}` : `${b}/`
}

function xmlMatch(block: string, tag: string): string | undefined {
  // 兼容带 namespace 前缀（如 <D:href>、<d:href>、<dav:href>）以及无前缀
  const re = new RegExp(`<(?:[A-Za-z]+:)?${tag}>([\\s\\S]*?)</(?:[A-Za-z]+:)?${tag}>`, 'i')
  const m = block.match(re)
  return m ? m[1].trim() : undefined
}

function xmlIsCollection(block: string): boolean {
  const rt = xmlMatch(block, 'resourcetype')
  if (!rt) return false
  return /<(?:[A-Za-z]+:)?collection\b/i.test(rt)
}

function xmlGetContentLength(block: string): number {
  const v = xmlMatch(block, 'getcontentlength')
  if (!v) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function xmlGetLastModified(block: string): string | undefined {
  return xmlMatch(block, 'getlastmodified')
}

export interface WebDavPingResult {
  ok: boolean
  error?: string
}

export async function webDavPing(server: WebDavConfig): Promise<WebDavPingResult> {
  try {
    const res = await fetch(joinDavUrl(server.url, '/'), {
      method: 'PROPFIND',
      headers: { Authorization: webDavAuthHeader(server), Depth: '0', 'Content-Type': 'application/xml' },
    })
    if (res.status === 401 || res.status === 403) return { ok: false, error: '认证失败' }
    if (!res.ok && res.status !== 207) return { ok: false, error: `HTTP ${res.status}` }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown' }
  }
}

export async function webDavList(server: WebDavConfig, path = '/'): Promise<WebDavFile[]> {
  const url = joinDavUrl(server.url, path)
  const res = await fetch(url, {
    method: 'PROPFIND',
    headers: { Authorization: webDavAuthHeader(server), Depth: '1', 'Content-Type': 'application/xml' },
  })
  if (res.status === 404) return []
  if (!res.ok && res.status !== 207) throw new Error(`HTTP ${res.status}`)
  const xml = await res.text()
  return parsePropfindResponse(xml, server.url, path)
}

function parsePropfindResponse(xml: string, baseUrl: string, currentPath: string): WebDavFile[] {
  const files: WebDavFile[] = []
  // 兼容带 namespace 的 <response>
  const re = /<(?:[A-Za-z]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z]+:)?response>/gi
  let m: RegExpExecArray | null
  // base 的 pathname（用于判断是否等于 base）
  let basePath = '/'
  try { basePath = new URL(baseUrl).pathname.replace(/\/+$/, '') || '/' } catch {}
  const curRel = normalizeRelativePath(currentPath)

  while ((m = re.exec(xml)) !== null) {
    const block = m[1]
    const rawHref = xmlMatch(block, 'href')
    if (!rawHref) continue
    const href = decodeURIComponent(rawHref)
    // href 可能是绝对 URL 或相对路径
    let hrefPath: string
    try {
      hrefPath = new URL(href).pathname
    } catch {
      hrefPath = href
    }
    hrefPath = hrefPath.replace(/\/+$/, '') || '/'

    // 跳过 base 自身以及当前目录
    const isBase = hrefPath === basePath || hrefPath === basePath + '/'
    const isCurDir =
      (hrefPath === curRel || hrefPath + '/' === curRel + '/') ||
      (hrefPath === basePath + curRel) ||
      (hrefPath === (basePath.replace(/\/+$/, '') + curRel))
    if (isBase || isCurDir) continue

    const name = hrefPath.split('/').filter(Boolean).pop() || ''
    if (!name) continue

    const isCollection = xmlIsCollection(block)
    const size = xmlGetContentLength(block)
    const modified = xmlGetLastModified(block)

    files.push({
      path: hrefPath.startsWith(basePath) ? hrefPath.slice(basePath.length) || '/' : hrefPath,
      href,
      name,
      isDir: isCollection,
      size,
      modified,
    })
  }

  // 按目录在前、文件在后，再按名称排序
  files.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return files
}

// 构造可下载 URL（path 为相对路径，如 '/foo/bar.mp4'）
export function webDavDownloadUrl(server: WebDavConfig, path: string): string {
  return joinDavUrl(server.url, path)
}

export interface WebDavResourceInfo {
  path: string
  name: string
  isDir: boolean
  size: number
  modified?: string
}

export async function webDavGetResourceInfo(server: WebDavConfig, path: string): Promise<WebDavResourceInfo | null> {
  try {
    const url = joinDavUrl(server.url, path)
    const res = await fetch(url, {
      method: 'PROPFIND',
      headers: { Authorization: webDavAuthHeader(server), Depth: '0', 'Content-Type': 'application/xml' },
    })
    if (res.status === 404) return null
    if (!res.ok && res.status !== 207) return null
    const xml = await res.text()
    const blockMatch = xml.match(/<(?:[A-Za-z]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z]+:)?response>/i)
    if (!blockMatch) return null
    const block = blockMatch[1]
    const isCollection = xmlIsCollection(block)
    const size = xmlGetContentLength(block)
    const modified = xmlGetLastModified(block)
    const relPath = normalizeRelativePath(path)
    return {
      path: relPath,
      name: relPath.split('/').filter(Boolean).pop() || '',
      isDir: isCollection,
      size,
      modified,
    }
  } catch {
    return null
  }
}

export async function webDavMkdir(server: WebDavConfig, path: string): Promise<boolean> {
  try {
    const url = joinDavUrl(server.url, path).replace(/\/+$/, '')
    const res = await fetch(url, {
      method: 'MKCOL',
      headers: { Authorization: webDavAuthHeader(server) },
    })
    return res.ok || res.status === 405
  } catch {
    return false
  }
}

export async function webDavDelete(server: WebDavConfig, path: string): Promise<boolean> {
  try {
    const url = joinDavUrl(server.url, path)
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: webDavAuthHeader(server) },
    })
    return res.ok
  } catch {
    return false
  }
}

export async function webDavMove(server: WebDavConfig, from: string, to: string): Promise<boolean> {
  try {
    const fromUrl = joinDavUrl(server.url, from)
    const toUrl = joinDavUrl(server.url, to)
    const res = await fetch(fromUrl, {
      method: 'MOVE',
      headers: { Authorization: webDavAuthHeader(server), Destination: toUrl, Overwrite: 'T' },
    })
    return res.ok
  } catch {
    return false
  }
}

export async function webDavCopy(server: WebDavConfig, from: string, to: string): Promise<boolean> {
  try {
    const fromUrl = joinDavUrl(server.url, from)
    const toUrl = joinDavUrl(server.url, to)
    const res = await fetch(fromUrl, {
      method: 'COPY',
      headers: { Authorization: webDavAuthHeader(server), Destination: toUrl, Overwrite: 'T' },
    })
    return res.ok
  } catch {
    return false
  }
}

export async function webDavUpload(server: WebDavConfig, remotePath: string, data: Blob | string, contentType = 'application/octet-stream'): Promise<boolean> {
  try {
    const url = joinDavUrl(server.url, remotePath)
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: webDavAuthHeader(server), 'Content-Type': contentType },
      body: data,
    })
    return res.ok
  } catch {
    return false
  }
}