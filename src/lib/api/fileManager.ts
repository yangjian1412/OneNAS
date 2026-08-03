import type { ServerConfig, WebDavConfig, FileItem, FileBackend } from '@/types'
import { login as fbLogin, listFiles as fbListFiles, searchFilesStream as fbSearchFilesStream, createFolder as fbCreateFolder, deleteResource as fbDeleteResource, renameResource as fbRenameResource, copyResource as fbCopyResource, uploadResource as fbUploadResource, getShares as fbGetShares, createShare as fbCreateShare, deleteShare as fbDeleteShare, getResourceInfo as fbGetResourceInfo, getFileChecksum as fbGetFileChecksum, ResourceInfo } from '@/lib/api/filebrowser'
import { webDavPing, webDavList, webDavMkdir, webDavDelete, webDavMove, webDavCopy, webDavUpload } from '@/lib/api/webdav'

export type { FileBackend } from '@/types'

// 把 WebDavConfig 转成符合 filebrowser 形状的"伪 ServerConfig"用于 filebrowser API 内部 token 流程
function webDavToServer(cfg: WebDavConfig): ServerConfig {
  return {
    id: cfg.id,
    name: cfg.name,
    type: 'filebrowser',
    host: '',
    port: 0,
    protocol: cfg.url.startsWith('https') ? 'https' : 'http',
    username: cfg.username,
    password: cfg.password,
  }
}

export interface ConnectResult {
  ok: boolean
  token?: string
  error?: string
}

export async function connectFileManager(server: ServerConfig | null, backend: FileBackend, webdavServer: WebDavConfig | null): Promise<ConnectResult> {
  if (backend === 'webdav') {
    if (!webdavServer) return { ok: false, error: 'WebDAV 未配置' }
    const ping = await webDavPing(webdavServer)
    if (ping.ok) return { ok: true, token: 'webdav' }
    return { ok: false, error: ping.error }
  }
  if (!server) return { ok: false, error: 'FileBrowser 未配置' }
  const r = await fbLogin(server)
  if (r.ok) return { ok: true, token: r.data }
  return { ok: false, error: r.error }
}

export async function listDir(server: ServerConfig | null, token: string, path: string, backend: FileBackend, webdavServer: WebDavConfig | null): Promise<{ ok: boolean; files?: FileItem[]; error?: string }> {
  if (backend === 'webdav') {
    if (!webdavServer) return { ok: false, error: 'WebDAV 未配置' }
    const files = await webDavList(webdavServer, path)
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
  const r = await fbListFiles(server!, token, path)
  if (r.ok) return { ok: true, files: r.data as unknown as FileItem[] }
  return { ok: false, error: r.error }
}

export async function mkdir(server: ServerConfig | null, token: string, path: string, backend: FileBackend, webdavServer: WebDavConfig | null): Promise<{ ok: boolean; error?: string }> {
  if (backend === 'webdav') {
    if (!webdavServer) return { ok: false, error: 'WebDAV 未配置' }
    const ok = await webDavMkdir(webdavServer, path)
    return ok ? { ok: true } : { ok: false, error: '创建失败' }
  }
  const r = await fbCreateFolder(server!, token, path)
  return r.ok ? { ok: true } : { ok: false, error: (r as any).error }
}

export async function removeFiles(server: ServerConfig | null, token: string, paths: string[], backend: FileBackend, webdavServer: WebDavConfig | null): Promise<{ ok: boolean; error?: string }> {
  if (backend === 'webdav') {
    if (!webdavServer) return { ok: false, error: 'WebDAV 未配置' }
    let allOk = true
    for (const p of paths) {
      const ok = await webDavDelete(webdavServer, p)
      if (!ok) allOk = false
    }
    return allOk ? { ok: true } : { ok: false, error: '部分删除失败' }
  }
  const results = await Promise.all(paths.map((p) => fbDeleteResource(server!, token, p)))
  const allOk = results.every((r) => r.ok)
  return allOk ? { ok: true } : { ok: false, error: '部分删除失败' }
}

export async function renameFile(server: ServerConfig | null, token: string, from: string, to: string, backend: FileBackend, webdavServer: WebDavConfig | null): Promise<{ ok: boolean; error?: string }> {
  if (backend === 'webdav') {
    if (!webdavServer) return { ok: false, error: 'WebDAV 未配置' }
    const ok = await webDavMove(webdavServer, from, to)
    return ok ? { ok: true } : { ok: false, error: '重命名失败' }
  }
  const r = await fbRenameResource(server!, token, from, to)
  return r.ok ? { ok: true } : { ok: false, error: (r as any).error }
}

export async function copyFile(server: ServerConfig | null, token: string, from: string, to: string, backend: FileBackend, webdavServer: WebDavConfig | null): Promise<{ ok: boolean; error?: string }> {
  if (backend === 'webdav') {
    if (!webdavServer) return { ok: false, error: 'WebDAV 未配置' }
    const ok = await webDavCopy(webdavServer, from, to)
    return ok ? { ok: true } : { ok: false, error: '复制失败' }
  }
  const r = await fbCopyResource(server!, token, from, to)
  return r.ok ? { ok: true } : { ok: false, error: (r as any).error }
}

export async function uploadFile(server: ServerConfig | null, token: string, localUri: string, remotePath: string, backend: FileBackend, webdavServer: WebDavConfig | null): Promise<{ ok: boolean; error?: string }> {
  if (backend === 'webdav') {
    if (!webdavServer) return { ok: false, error: 'WebDAV 未配置' }
    // 读取本地文件，转成 Blob 上传
    try {
      const file = new File(localUri)
      const buf = await file.arrayBuffer()
      const blob = new Blob([buf])
      const ok = await webDavUpload(webdavServer, remotePath, blob)
      return ok ? { ok: true } : { ok: false, error: '上传失败' }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? '上传失败' }
    }
  }
  const r = await fbUploadResource(server!, token, localUri, remotePath)
  return r.ok ? { ok: true } : { ok: false, error: (r as any).error }
}

// 仅 filebrowser 支持的高级特性（WebDAV 模式下使用会返回 ok:false 并提示）
export async function searchFilesStream(server: ServerConfig, token: string, query: string, path: string, signal: AbortSignal, onItem: (item: FileItem) => void, backend: FileBackend): Promise<{ ok: boolean; error?: string }> {
  if (backend === 'webdav') {
    return { ok: false, error: 'WebDAV 暂不支持搜索' }
  }
  return await fbSearchFilesStream(server, token, query, path, signal, onItem)
}

export async function getShares(server: ServerConfig, token: string, backend: FileBackend): Promise<{ ok: boolean; data?: any[]; error?: string }> {
  if (backend === 'webdav') {
    return { ok: false, error: 'WebDAV 不支持分享' }
  }
  const r = await fbGetShares(server, token)
  if (r.ok) return { ok: true, data: r.data }
  return { ok: false, error: (r as any).error }
}

export async function createShare(server: ServerConfig, token: string, path: string, password?: string, expiry?: string, backend: FileBackend = 'filebrowser'): Promise<{ ok: boolean; data?: any; error?: string }> {
  if (backend === 'webdav') {
    return { ok: false, error: 'WebDAV 不支持分享' }
  }
  const r = await fbCreateShare(server, token, path, password, expiry)
  if (r.ok) return { ok: true, data: (r as any).data }
  return { ok: false, error: (r as any).error }
}

export async function deleteShare(server: ServerConfig, token: string, hash: string, backend: FileBackend = 'filebrowser'): Promise<{ ok: boolean; error?: string }> {
  if (backend === 'webdav') {
    return { ok: false, error: 'WebDAV 不支持分享' }
  }
  const r = await fbDeleteShare(server, token, hash)
  return r.ok ? { ok: true } : { ok: false, error: (r as any).error }
}

export async function getResourceInfo(server: ServerConfig, token: string, path: string, backend: FileBackend): Promise<{ ok: boolean; data?: ResourceInfo; error?: string }> {
  if (backend === 'webdav') {
    // WebDAV 用 getObject 直接获取文件头信息
    return { ok: false, error: 'WebDAV 暂不支持该功能' }
  }
  return await fbGetResourceInfo(server, token, path)
}

export async function getFileChecksum(server: ServerConfig, token: string, path: string, algo: 'md5' | 'sha1' | 'sha256' | 'sha512', backend: FileBackend): Promise<{ ok: boolean; hash?: string; error?: string }> {
  if (backend === 'webdav') {
    return { ok: false, error: 'WebDAV 不支持 checksum' }
  }
  return await fbGetFileChecksum(server, token, path, algo)
}