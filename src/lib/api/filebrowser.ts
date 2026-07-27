import { Buffer } from 'buffer'
import { buildUrl } from './client'
import iconv from 'iconv-lite'
import { FileItem, ServerConfig, ShareInfo } from '@/types'
import { File, UploadType } from 'expo-file-system'

const TIMEOUT_MS = 15000

async function fetchText(url: string, options: RequestInit = {}): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const res = await fetch(url, { ...options, signal: controller.signal })
  clearTimeout(timer)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.text()
}

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const text = await fetchText(url, options)
  return JSON.parse(text) as T
}

export async function login(server: ServerConfig): Promise<{ ok: true; data: string } | { ok: false; error: string }> {
  try {
    const base = buildUrl(server.protocol, server.host, server.port)
    const token = await fetchText(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: server.username ?? '',
        password: server.password ?? '',
        recaptcha: '',
      }),
    })
    return { ok: true, data: token }
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'Network error' }
  }
}

interface RawFileItem {
  name: string
  path: string
  isDir?: boolean
  isDirectory?: boolean
  size: number
  modified?: string
  modTime?: string
}

function mapFileItem(raw: RawFileItem): FileItem {
  return {
    name: raw.name,
    path: raw.path,
    isDirectory: raw.isDir ?? raw.isDirectory ?? false,
    size: raw.size,
    modified: raw.modified ?? raw.modTime ?? '',
  }
}

function resourceUrl(server: ServerConfig, path: string) {
  const base = buildUrl(server.protocol, server.host, server.port)
  const suffix = path === '/' ? '' : `/${encodeURI(path.replace(/^\/+/, ''))}`
  return `${base}/api/resources${suffix}`
}

async function requestResource(server: ServerConfig, token: string, path: string, options: RequestInit = {}) {
  const response = await fetch(resourceUrl(server, path), {
    ...options,
    headers: { 'X-Auth': token, ...(options.headers ?? {}) },
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response
}

export async function createFolder(server: ServerConfig, token: string, path: string) {
  try {
    await requestResource(server, token, path.endsWith('/') ? path : `${path}/`, { method: 'POST' })
    return { ok: true as const }
  } catch (err: any) {
    return { ok: false as const, error: err.message ?? 'Create folder failed' }
  }
}

export async function deleteResource(server: ServerConfig, token: string, path: string) {
  try {
    await requestResource(server, token, path, { method: 'DELETE' })
    return { ok: true as const }
  } catch (err: any) {
    return { ok: false as const, error: err.message ?? 'Delete failed' }
  }
}

export async function renameResource(server: ServerConfig, token: string, path: string, destination: string) {
  try {
    const query = `?action=rename&destination=${encodeURIComponent(destination)}`
    await requestResource(server, token, `${path}${query}`)
    return { ok: true as const }
  } catch (err: any) {
    return { ok: false as const, error: err.message ?? 'Rename failed' }
  }
}

export async function copyResource(server: ServerConfig, token: string, path: string, destination: string) {
  try {
    const query = `?action=copy&destination=${encodeURIComponent(destination)}`
    await requestResource(server, token, `${path}${query}`)
    return { ok: true as const }
  } catch (err: any) {
    return { ok: false as const, error: err.message ?? 'Copy failed' }
  }
}

export async function uploadResource(server: ServerConfig, token: string, localUri: string, remotePath: string) {
  try {
    const file = new File(localUri)
    const response = await file.upload(resourceUrl(server, `${remotePath}?override=true`), {
      httpMethod: 'POST',
      uploadType: UploadType.BINARY_CONTENT,
      headers: { 'X-Auth': token },
    })
    if (response.status < 200 || response.status >= 300) throw new Error(`${response.status}`)
    return { ok: true as const }
  } catch (err: any) {
    return { ok: false as const, error: err.message ?? 'Upload failed' }
  }
}

export async function listFiles(
  server: ServerConfig,
  token: string,
  path: string = '/',
): Promise<{ ok: true; data: FileItem[] } | { ok: false; error: string }> {
  try {
    const base = buildUrl(server.protocol, server.host, server.port)
    const payload = await fetchJson<RawFileItem[] | { items?: RawFileItem[] }>(resourceUrl(server, path), {
      headers: { 'X-Auth': token },
    })
    const raw = Array.isArray(payload) ? payload : (payload.items ?? [])
    return { ok: true, data: raw.map(mapFileItem) }
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'Network error' }
  }
}

function authHeaders(token: string): Record<string, string> {
  return { 'X-Auth': token, 'Content-Type': 'application/json' }
}

export interface ResourceInfo {
  name: string
  path: string
  isDir: boolean
  size: number
  modified: string
  numFiles?: number
  numDirs?: number
  type?: string
  resolution?: { width: number; height: number }
  checksums?: Record<string, string>
}

export async function getFileContent(
  server: ServerConfig, token: string, path: string
): Promise<{ ok: true; data: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(resourceUrl(server, path), {
      headers: { 'X-Auth': token, 'X-Encoding': 'true' },
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const ct = res.headers.get('content-type') ?? ''
    let content: string
    if (ct.includes('application/json')) {
      const json = await res.json()
      content = json.content ?? ''
    } else {
      const buf = await res.arrayBuffer()
      content = decodeText(buf)
    }
    return { ok: true, data: content }
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'Failed to load file content' }
  }
}

function decodeText(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch {}
  try { return iconv.decode(Buffer.from(u8), 'gbk') } catch {}
  return new TextDecoder('utf-8', { fatal: false }).decode(buf)
}

export async function saveFileContent(
  server: ServerConfig, token: string, path: string, content: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(resourceUrl(server, path), {
      method: 'PUT',
      headers: { 'X-Auth': token, 'Content-Type': 'text/plain' },
      body: content,
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'Failed to save file content' }
  }
}

export async function getResourceInfo(
  server: ServerConfig, token: string, path: string
): Promise<{ ok: true; data: ResourceInfo } | { ok: false; error: string }> {
  try {
    const raw = await fetchJson<any>(resourceUrl(server, path), {
      headers: { 'X-Auth': token },
    })
    const info: ResourceInfo = {
      name: raw.name ?? '',
      path: raw.path ?? path,
      isDir: raw.isDir ?? false,
      size: raw.size ?? 0,
      modified: raw.modified ?? raw.modTime ?? '',
      numFiles: raw.numFiles,
      numDirs: raw.numDirs,
      type: raw.type,
      resolution: raw.resolution,
    }
    return { ok: true, data: info }
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'Failed to get resource info' }
  }
}

export async function getFileChecksum(
  server: ServerConfig, token: string, path: string, algo: string
): Promise<{ ok: true; data: string } | { ok: false; error: string }> {
  try {
    const raw = await fetchJson<any>(`${resourceUrl(server, path)}?checksum=${algo}`, {
      headers: { 'X-Auth': token },
    })
    const hash: string | undefined = raw?.checksums?.[algo]
    if (!hash) return { ok: false, error: 'Checksum not available' }
    return { ok: true, data: hash }
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'Checksum failed' }
  }
}

export async function getShares(server: ServerConfig, token: string): Promise<{ ok: true; data: ShareInfo[] } | { ok: false; error: string }> {
  try {
    const base = buildUrl(server.protocol, server.host, server.port)
    const data = await fetchJson<ShareInfo[]>(`${base}/api/shares`, { headers: authHeaders(token) })
    return { ok: true, data }
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'Failed to list shares' }
  }
}

export async function createShare(
  server: ServerConfig, token: string, path: string, password?: string, expireDays?: number,
): Promise<{ ok: true; data: ShareInfo } | { ok: false; error: string }> {
  try {
    const base = buildUrl(server.protocol, server.host, server.port)
    const encoded = path === '/' ? '' : `/${encodeURI(path.replace(/^\/+/, ''))}`
    let url = `${base}/api/share${encoded}`
    const params: string[] = []
    if (expireDays && expireDays > 0) { params.push(`expires=${expireDays}`, 'unit=days') }
    if (params.length) url += `?${params.join('&')}`
    let body = '{}'
    if (password) body = JSON.stringify({ password })
    const data = await fetchJson<ShareInfo>(url, {
      method: 'POST',
      headers: authHeaders(token),
      body,
    })
    return { ok: true, data }
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'Failed to create share' }
  }
}

export async function deleteShare(server: ServerConfig, token: string, hash: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const base = buildUrl(server.protocol, server.host, server.port)
    await fetchText(`${base}/api/share/${encodeURIComponent(hash)}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    })
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'Failed to delete share' }
  }
}

export async function searchFiles(server: ServerConfig, token: string, query: string) {
  try {
    const base = buildUrl(server.protocol, server.host, server.port)
    const response = await fetchJson<RawFileItem[] | { items?: RawFileItem[]; results?: RawFileItem[] }>(
      `${base}/api/search?query=${encodeURIComponent(query)}`,
      { headers: { 'X-Auth': token } },
    )
    const raw = Array.isArray(response) ? response : (response.items ?? response.results ?? [])
    return { ok: true as const, data: raw.map(mapFileItem) }
  } catch (err: any) {
    return { ok: false as const, error: err.message ?? 'Search failed' }
  }
}

export async function searchFilesStream(
  server: ServerConfig, token: string, query: string, scope?: string, signal?: AbortSignal, onItem?: (item: FileItem) => void
): Promise<{ ok: true; data: FileItem[] } | { ok: false; error: string }> {
  const controller = new AbortController()
  const onExtAbort = () => { controller.abort() }
  signal?.addEventListener('abort', onExtAbort)

  const itemsRef: FileItem[] = []
  const pendingRef: FileItem[] = []

  const flushPending = () => {
    if (pendingRef.length === 0) return
    const batch = pendingRef.splice(0)
    for (const item of batch) {
      try { onItem?.(item) } catch (e) { console.log('[search] onItem error:', e) }
    }
  }

  const pushItem = (item: FileItem) => {
    itemsRef.push(item)
    pendingRef.push(item)
    flushPending()
  }

  const parseLine = (line: string): FileItem | null => {
    const trimmed = line.trim()
    if (!trimmed) return null
    try {
      const raw = JSON.parse(trimmed)
      if (!raw || typeof raw !== 'object') return null
      const pathParts = (raw.path ?? '').split('/').filter(Boolean)
      if (!raw.path) return null
      return {
        name: pathParts.pop() ?? '',
        path: raw.path,
        isDirectory: raw.dir ?? false,
        size: raw.size ?? 0,
        modified: raw.modified ?? raw.modTime ?? '',
      }
    } catch { return null }
  }

  try {
    const base = buildUrl(server.protocol, server.host, server.port)
    const cleanScope = scope && scope !== '/' ? scope.replace(/^\//, '').replace(/\/$/, '') : ''
    const searchPath = cleanScope ? `/${encodeURIComponent(cleanScope)}` : '/'
    const url = `${base}/api/search${searchPath}?query=${encodeURIComponent(query)}`
    console.log('[search] START fetch:', url)
    const response = await fetch(url, {
      headers: { 'X-Auth': token },
      signal: controller.signal,
    })
    console.log('[search] response ok:', response.ok, 'status:', response.status)
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const tryBody = (response as any).body
    console.log('[search] body type:', typeof tryBody, 'getReader:', typeof tryBody?.getReader)

    if (tryBody?.getReader) {
      console.log('[search] using streaming getReader path')
      const reader = tryBody.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let readCount = 0
      let detectedFormat: 'array' | 'ndjson' | null = null
      let firstRaw = ''
      while (true) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        const { done, value } = await reader.read()
        if (done) break
        readCount++
        const chunk = decoder.decode(value, { stream: true })
        if (firstRaw.length < 300) firstRaw += chunk
        if (detectedFormat === null) {
          const trimmed = chunk.trim()
          if (trimmed.startsWith('[')) {
            detectedFormat = 'array'
            console.log('[search] detected JSON array format')
          } else if (trimmed.startsWith('{')) {
            detectedFormat = 'ndjson'
            console.log('[search] detected NDJSON format')
          }
        }
        if (detectedFormat === 'array') {
          buffer += chunk
        } else {
          buffer += chunk
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) { const item = parseLine(line); if (item) pushItem(item) }
          flushPending()
        }
        if (readCount % 10 === 0) console.log('[search] read', readCount, 'chunks, items:', itemsRef.length)
      }
      if (detectedFormat === 'array') {
        console.log('[search] final buffer length:', buffer.length)
        try {
          const arr = JSON.parse(buffer)
          if (Array.isArray(arr)) {
            for (const raw of arr) {
              const pathParts = (raw.path ?? '').split('/').filter(Boolean)
              if (raw.path) {
                pushItem({
                  name: pathParts.pop() ?? '',
                  path: raw.path,
                  isDirectory: raw.dir ?? raw.isDir ?? false,
                  size: raw.size ?? 0,
                  modified: raw.modified ?? raw.modTime ?? '',
                })
              }
            }
          }
        } catch (e) { console.log('[search] JSON array parse error:', e) }
      } else {
        if (buffer.trim()) { const item = parseLine(buffer); if (item) pushItem(item) }
      }
      console.log('[search] stream done, total reads:', readCount, 'items:', itemsRef.length)
      console.log('[search] first raw:', JSON.stringify(firstRaw))
    } else {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      console.log('[search] using fallback text path')
      const text = await response.text()
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      console.log('[search] text length:', text.length, 'first 300:', text.slice(0, 300))
      const trimmed = text.trim()
      if (trimmed.startsWith('[')) {
        try {
          const arr = JSON.parse(trimmed)
          if (Array.isArray(arr)) {
            for (const raw of arr) {
              const pathParts = (raw.path ?? '').split('/').filter(Boolean)
              if (raw.path) {
                pushItem({
                  name: pathParts.pop() ?? '',
                  path: raw.path,
                  isDirectory: raw.dir ?? raw.isDir ?? false,
                  size: raw.size ?? 0,
                  modified: raw.modified ?? raw.modTime ?? '',
                })
              }
            }
          }
        } catch (e) { console.log('[search] fallback JSON parse error:', e) }
      } else {
        const lines = text.split('\n').filter(Boolean)
        for (const line of lines) { const item = parseLine(line); if (item) pushItem(item) }
      }
      flushPending()
    }
    console.log('[search] returning', itemsRef.length, 'items')
    return { ok: true, data: itemsRef }
  } catch (err: any) {
    console.log('[search] error:', err.message, err.name)
    if (err.name === 'AbortError') {
      return { ok: false, error: 'Cancelled' }
    }
    return { ok: false, error: err.message ?? '搜索失败' }
  } finally {
    console.log('[search] finally, flushing pending')
    try { flushPending() } catch (e) { console.log('[search] flushPending error:', e) }
    signal?.removeEventListener('abort', onExtAbort)
  }
}
