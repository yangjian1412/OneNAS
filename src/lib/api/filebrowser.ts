import { buildUrl } from './client'
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
