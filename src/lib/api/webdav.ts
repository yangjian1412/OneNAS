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

// 把相对路径拼到 base url 后，每段路径单独 RFC 3986 编码（UTF-8）
export function joinDavUrl(base: string, sub: string): string {
  const b = base.replace(/\/+$/, '')
  const norm = normalizeRelativePath(sub)
  const segs = norm.split('/').filter(Boolean).map((s) => encodeDavSegment(s)).join('/')
  return segs ? `${b}/${segs}` : `${b}/`
}

// RFC 3986 段编码：UTF-8 percent-encoding + 转义保留字符 (!'()*)
function encodeDavSegment(seg: string): string {
  return encodeURIComponent(seg).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

function xmlMatch(block: string, tag: string): string | undefined {
  // 兼容带 namespace 前缀（如 <D:href>、<d:href>、<dav:href>）以及无前缀
  // 同时兼容成对闭合 <tag>x</tag> 和自闭合 <tag/>（自闭合返回空串，由调用方区分）
  const re = new RegExp(`<(?:[A-Za-z]+:)?${tag}(\\s[^>]*)?(?:/>|>([\\s\\S]*?)</(?:[A-Za-z]+:)?${tag}>)`, 'i')
  const m = block.match(re)
  if (!m) return undefined
  // 自闭合：m[2] 不存在 → 返回 ''
  if (m[2] === undefined) return ''
  return m[2].trim()
}

function xmlIsCollection(block: string, hrefTrailingSlash: boolean): boolean {
  // 标准判定：<D:resourcetype><D:collection/>...</D:resourcetype> 嵌套
  // 兼容成对闭合 + 自闭合两种写法
  // 自闭合 resourcetype（<D:resourcetype/>）严格说不是 collection，但某些 server
  // 把 resourcetype 完全缺失或自闭合视为文件，所以我们需要 href 末尾 / 兜底。
  // XML 路径：resourcetype 内是否显式包含 collection 标签
  const rt = xmlMatch(block, 'resourcetype')
  if (rt != null) {
    if (rt === '') {
      // 自闭合 <D:resourcetype/> — 可能是文件
      // 不据此判目录
    } else {
      // 成对闭合 <D:resourcetype>...</D:resourcetype>，检查内部 collection
      if (/<(?:[A-Za-z]+:)?collection\b/i.test(rt)) return true
      // 显式成对闭合但没有 collection 标签 → 文件
      return false
    }
  }
  // 兜底：按 RFC 4918，目录的 href 必须以 / 结尾
  return hrefTrailingSlash
}

function xmlGetContentLength(block: string): number {
  const v = xmlMatch(block, 'getcontentlength')
  if (!v) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function xmlGetLastModified(block: string): string | undefined {
  const v = xmlMatch(block, 'getlastmodified')
  return v || undefined
}

function xmlGetDisplayName(block: string): string | undefined {
  const v = xmlMatch(block, 'displayname')
  return v || undefined
}

export interface WebDavPingResult {
  ok: boolean
  error?: string
}

// 显式请求 resourcetype 等关键属性；很多 WebDAV 后端（Alist/OpenList 等）
// 在不带 body 或仅 <D:allprop/> 的 PROPFIND 响应里不返回 <D:resourcetype>，
// 会导致目录被误判为文件。
const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:resourcetype/>
    <D:getcontentlength/>
    <D:getlastmodified/>
    <D:displayname/>
  </D:prop>
</D:propfind>`

export async function webDavPing(server: WebDavConfig): Promise<WebDavPingResult> {
  try {
    const res = await fetch(joinDavUrl(server.url, '/'), {
      method: 'PROPFIND',
      headers: { Authorization: webDavAuthHeader(server), Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' },
      body: PROPFIND_BODY,
    })
    if (res.status === 401 || res.status === 403) return { ok: false, error: '认证失败' }
    if (!res.ok && res.status !== 207) return { ok: false, error: `HTTP ${res.status}` }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown' }
  }
}

export async function webDavList(server: WebDavConfig, path = '/'): Promise<WebDavFile[]> {
  // 列表永远是对"目录"的 PROPFIND，目录 URL 必须以 / 结尾：
  // Apache mod_dav 对无尾斜杠的集合 PROPFIND 会返回 301（Location 降级为 http），
  // 客户端跟随跳转时 origin 变化会丢弃 Authorization → 401。
  const url = joinDavUrl(server.url, path).replace(/\/+$/, '') + '/'
  const res = await fetch(url, {
    method: 'PROPFIND',
    headers: { Authorization: webDavAuthHeader(server), Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
    body: PROPFIND_BODY,
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
    // href 解码（群晖/Apache 偶尔会双重编码，尝试两次）
    let href = decodeURIComponent(rawHref)
    if (href !== rawHref && href.includes('%')) href = decodeURIComponent(href)
    // href 可能是绝对 URL 或相对路径
    let hrefPath: string
    try {
      hrefPath = new URL(href).pathname
    } catch {
      hrefPath = href
    }

    // RFC 4918：目录的 href 必须以 / 结尾；保留原始尾部斜杠信息供 isDir 判定
    const hasTrailingSlash = hrefPath.endsWith('/')
    hrefPath = hrefPath.replace(/\/+$/, '') || '/'

    // 跳过 base 自身以及当前目录（任何形态：单独、组合、含尾斜杠）
    const isBase = hrefPath === basePath
    const curFullPath = basePath === '/' ? curRel : (basePath + curRel)
    const isCurDir = hrefPath === curFullPath || hrefPath === curRel
    if (isBase || isCurDir) continue

    const name = (xmlGetDisplayName(block) || hrefPath.split('/').filter(Boolean).pop() || '').trim()
    if (!name) continue

    const isCollection = xmlIsCollection(block, hasTrailingSlash)
    const size = xmlGetContentLength(block)
    const modified = xmlGetLastModified(block)

    // 派生 path：去掉 basePath 前缀，归一化为相对路径
    let relPath: string
    if (basePath === '/') {
      relPath = hrefPath === '/' ? '/' : (hrefPath.startsWith('/') ? hrefPath : '/' + hrefPath)
    } else if (hrefPath === basePath || hrefPath === basePath + '/') {
      relPath = '/'
    } else if (hrefPath.startsWith(basePath + '/')) {
      relPath = hrefPath.slice(basePath.length) || '/'
    } else {
      relPath = hrefPath.startsWith('/') ? hrefPath : '/' + hrefPath
    }

    files.push({
      path: relPath,
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

export async function webDavGetResourceInfo(server: WebDavConfig, path: string, isDir = false): Promise<WebDavResourceInfo | null> {
  try {
    // 目录的 PROPFIND 需要尾斜杠（否则 Apache 301 → http 降级 → 丢 Authorization → 401）；
    // 文件保持无尾斜杠。
    const base = joinDavUrl(server.url, path)
    const url = isDir ? base.replace(/\/+$/, '') + '/' : base
    const res = await fetch(url, {
      method: 'PROPFIND',
      headers: { Authorization: webDavAuthHeader(server), Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' },
      body: PROPFIND_BODY,
    })
    if (res.status === 404) return null
    if (!res.ok && res.status !== 207) return null
    const xml = await res.text()
    const blockMatch = xml.match(/<(?:[A-Za-z]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z]+:)?response>/i)
    if (!blockMatch) return null
    const block = blockMatch[1]
    // 用 href 末尾 / 兜底；PROPFIND Depth:0 响应里 href 一定存在
    const hrefBlock = xmlMatch(block, 'href') || ''
    const hasTrailingSlash = hrefBlock.endsWith('/')
    const isCollection = xmlIsCollection(block, hasTrailingSlash)
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