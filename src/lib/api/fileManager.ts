import type { ServerConfig, FileItem } from '@/types'
import { login as fbLogin, listFiles as fbListFiles } from '@/lib/api/filebrowser'
import { webDavPing, webDavList, serverToWebDav } from '@/lib/api/webdav'

export type FileBackend = 'filebrowser' | 'webdav'

export function getFileBackend(server: ServerConfig | null | undefined): FileBackend {
  return server?.fileBackend ?? 'filebrowser'
}

export interface ConnectResult {
  ok: boolean
  token?: string
  error?: string
}

export async function connectFileManager(server: ServerConfig): Promise<ConnectResult> {
  if (getFileBackend(server) === 'webdav') {
    const ping = await webDavPing(serverToWebDav(server))
    if (ping.ok) return { ok: true, token: 'webdav' }
    return { ok: false, error: ping.error }
  }
  const r = await fbLogin(server)
  if (r.ok) return { ok: true, token: r.data }
  return { ok: false, error: r.error }
}

export async function listDir(server: ServerConfig, _token: string, path: string): Promise<{ ok: boolean; files?: FileItem[]; error?: string }> {
  if (getFileBackend(server) === 'webdav') {
    const files = await webDavList(serverToWebDav(server), path)
    return {
      ok: true,
      files: files.map((f) => ({
        name: f.name,
        path: f.path,
        isDirectory: f.isDir,
        size: f.size,
        modified: f.modified,
      } as FileItem)),
    }
  }
  const r = await fbListFiles(server, _token, path)
  if (r.ok) return { ok: true, files: r.data as unknown as FileItem[] }
  return { ok: false, error: r.error }
}