import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type {
  OpenListServerConfig,
  OpenListFile,
  Aria2ServerConfig,
  ServiceConfig,
} from '@/types'
import {
  openListPing,
  openListList,
  openListGet,
  openListMkdir,
  openListRemove,
  openListRename,
  openListMove,
  openListCopy,
  openListLogin,
  openListFormUpload,
  openListResolveFileUrl,
  type OpenListUploadAsset,
} from '@/lib/api/openlist'
import { aria2AddUri, aria2GetGlobalOption, aria2TellStatus } from '@/lib/api/aria2'

const DOWNLOADER_PREFIX = 'openlist:downloader:'
const MAX_DEPTH = 20
const MAX_FILES = 1000

interface OpenListState {
  server: OpenListServerConfig | null
  path: string
  files: OpenListFile[]
  loading: boolean
  error: string | null

  multiSelect: boolean
  selectedPaths: string[]

  setServer: (server: OpenListServerConfig | null) => void
  setError: (e: string | null) => void
  logout: () => void

  /**
   * 进入子目录。优先使用服务端返回的 virtual_path，否则用本地拼接
   * `${currentPath}/${name}` 兜底（避免依赖驱动内部 path 字段）。
   */
  cd: (name: string, parentPath?: string) => Promise<void>
  cdByPath: (fullPath: string) => Promise<void>
  up: () => Promise<void>
  refresh: () => Promise<void>
  mkdir: (name: string) => Promise<boolean>
  remove: (dir: string, names: string[]) => Promise<boolean>
  rename: (path: string, newName: string) => Promise<boolean>
  move: (srcDir: string, names: string[], dstDir: string) => Promise<boolean>
  copy: (srcDir: string, names: string[], dstDir: string) => Promise<boolean>
  /** 推送到 aria2（前端直连 RPC）：传入要推送的路径数组，文件夹会被递归展开 */
  pushToAria2: (paths: string[]) => Promise<{ ok: boolean; count: number; error?: string; verify?: { ok: number; bad: number; badMsg?: string } }>
  upload: (remotePath: string, asset: OpenListUploadAsset) => Promise<boolean>
  getDownloader: () => Promise<NonNullable<OpenListServerConfig['downloader']> | null>
  setDownloader: (dl: NonNullable<OpenListServerConfig['downloader']> | null) => Promise<void>
  initWithService: (service: ServiceConfig) => Promise<void>

  enterMultiSelect: () => void
  exitMultiSelect: () => void
  toggleSelect: (path: string) => void
  selectAll: () => void
  clearSelection: () => void
}

function normalizeFromService(svc: ServiceConfig): OpenListServerConfig {
  return {
    id: svc.id,
    name: svc.name || 'OpenList',
    url: (svc.url || '').replace(/\/+$/, ''),
    username: svc.username || undefined,
    password: svc.password || undefined,
  }
}

// 规范化 OpenList 路径：保证以 / 开头、去掉 URL 前缀、去掉末尾斜杠
export function normalizeOpenListPath(p: string): string {
  let out = p
  if (/^https?:\/\//i.test(out)) {
    try { out = new URL(out).pathname } catch {}
  }
  if (!out.startsWith('/')) out = '/' + out
  out = out.replace(/\/+$/, '')
  return out || '/'
}

// 本地拼接：把父目录 + 子名合成清洁路径
export function joinOpenListPath(parent: string, name: string): string {
  const p = normalizeOpenListPath(parent)
  const n = name.replace(/^\/+/, '').replace(/\/+$/, '')
  if (p === '/') return '/' + n
  return p + '/' + n
}

export const useOpenListStore = create<OpenListState>((set, get) => ({
  server: null,
  path: '/',
  files: [],
  loading: false,
  error: null,

  multiSelect: false,
  selectedPaths: [],

  setServer: (server) => set({ server }),
  setError: (error) => set({ error }),
  logout: () => set({ server: null, files: [], path: '/', error: null, multiSelect: false, selectedPaths: [] }),

  initWithService: async (service) => {
    const cfg = normalizeFromService(service)
    if (!cfg.url) {
      set({ error: 'OpenList 未配置 URL' })
      return
    }

    // 只支持账号密码登录（去掉 token 登录）
    if (!cfg.username || !cfg.password) {
      set({ error: 'OpenList 需要配置账号密码' })
      return
    }
    const login = await openListLogin(cfg)
    if (!login.ok || !login.token) {
      set({ error: login.error ?? '登录失败' })
      return
    }
    cfg.token = login.token

    // 恢复下载工具（aria2）配置缓存
    const cachedDl = await getDownloaderCached(cfg.id)
    if (cachedDl && cachedDl.url) cfg.downloader = cachedDl

    set({ server: cfg, error: null })
    const ping = await openListPing(cfg)
    if (!ping.ok) {
      set({ error: ping.error ?? 'OpenList 连接失败' })
      return
    }
    void get().cdByPath('/')
  },

  cd: async (name, parentPath) => {
    const parent = parentPath ?? get().path
    const next = joinOpenListPath(parent, name)
    await get().cdByPath(next)
  },

  cdByPath: async (fullPath) => {
    const server = get().server
    if (!server) return
    const normalized = normalizeOpenListPath(fullPath)
    set({ loading: true, error: null, path: normalized, multiSelect: false, selectedPaths: [] })
    try {
      const files = await openListList(server, normalized)
      set({ files, loading: false })
    } catch (e: any) {
      set({ files: [], loading: false, error: e?.message ?? '打开目录失败' })
    }
  },

  up: async () => {
    const cur = get().path
    if (cur === '/' || cur === '') return
    const parent = cur.replace(/\/+$/, '').split('/').slice(0, -1).join('/') || '/'
    await get().cdByPath(parent)
  },

  refresh: async () => {
    const cur = get().path
    set({ multiSelect: false, selectedPaths: [] })
    await get().cdByPath(cur)
  },

  mkdir: async (name) => {
    const server = get().server
    if (!server) return false
    const target = joinOpenListPath(get().path, name)
    try {
      await openListMkdir(server, target)
      await get().refresh()
      return true
    } catch (e: any) {
      set({ error: e?.message ?? '创建失败' })
      return false
    }
  },

  remove: async (dir, names) => {
    const server = get().server
    if (!server || !names.length) return false
    try {
      await openListRemove(server, dir, names)
      await get().refresh()
      return true
    } catch (e: any) {
      set({ error: e?.message ?? '删除失败' })
      return false
    }
  },

  rename: async (path, newName) => {
    const server = get().server
    if (!server) return false
    try {
      await openListRename(server, path, newName)
      await get().refresh()
      return true
    } catch (e: any) {
      set({ error: e?.message ?? '重命名失败' })
      return false
    }
  },

  move: async (srcDir, names, dstDir) => {
    const server = get().server
    if (!server || !names.length) return false
    try {
      await openListMove(server, srcDir, names, dstDir)
      await get().refresh()
      return true
    } catch (e: any) {
      set({ error: e?.message ?? '移动失败' })
      return false
    }
  },

  copy: async (srcDir, names, dstDir) => {
    const server = get().server
    if (!server || !names.length) return false
    try {
      await openListCopy(server, srcDir, names, dstDir)
      await get().refresh()
      return true
    } catch (e: any) {
      set({ error: e?.message ?? '复制失败' })
      return false
    }
  },

  /** 递归展开文件夹，收集 { 文件名, 直链, 相对子目录 } */
  pushToAria2: async (paths) => {
    const server = get().server
    if (!server) return { ok: false, count: 0, error: '未连接' }
    const dl = server.downloader ?? (await getDownloaderCached(server.id))
    if (!dl || !dl.url) {
      const msg = '未配置下载工具（aria2），请在抽屉 → 下载工具设置 中配置'
      set({ error: msg })
      return { ok: false, count: 0, error: msg }
    }
    const rpc: Aria2ServerConfig = { id: 'openlist-dl', name: 'OpenList', url: dl.url, secret: dl.secret }
    try {
      const collected: { name: string; url: string; relDir: string }[] = []
      for (const p of paths) {
        if (collected.length >= MAX_FILES) break
        let entry: OpenListFile | null = null
        try { entry = await openListGet(server, p) } catch { continue }
        if (!entry) continue
        if (entry.is_dir) {
          await collectOpenListFiles(server, p, p, 0, collected)
        } else {
          try {
          const resolved = await openListResolveFileUrl(server, p)
          collected.push({ name: entry.name, url: resolved.url, relDir: '' })
        } catch {
          continue
        }
        }
      }
      if (!collected.length) {
        const msg = '没有可推送的文件'
        set({ error: msg })
        return { ok: false, count: 0, error: msg }
      }
      const saveDir = (await aria2GetGlobalOption(rpc))?.dir?.replace(/\/+$/, '') ?? ''
      // 让 aria2 带 Authorization 头拉直链，绕开对 sign 的强依赖（alist-web 也靠 sign，
      // 但部分存储驱动不返回 sign；带 Authorization 可让 aria2 通过认证）
      const authHeader = server.token ? `Authorization: ${server.token}` : ''
      const gids: string[] = []
      const errors: string[] = []
      let okCount = 0
      for (const f of collected) {
        const options: Record<string, string> = { out: f.name, 'check-certificate': 'false' }
        if (saveDir || f.relDir) options.dir = [saveDir, f.relDir].filter(Boolean).join('/')
        if (authHeader) options.header = authHeader
        try {
          const gid = await aria2AddUri(rpc, [f.url], options)
          gids.push(gid)
          okCount++
        } catch (e: any) {
          errors.push(`${f.name}: ${e?.message ?? 'addUri 失败'}`)
        }
      }
      // 反向验证：用返回的 gid 查 tellStatus，确认 aria2 真接收且未立即 error
      let bad = 0
      let badMsg = ''
      for (const gid of gids) {
        try {
          const s = await aria2TellStatus(rpc, gid)
          if (!s) { bad++; continue }
          if (s.status === 'error' || s.status === 'removed') {
            bad++
            if (!badMsg) badMsg = s.errorMessage || `状态 ${s.status}`
          }
        } catch {
          bad++
        }
      }
      const verify = { ok: okCount - bad, bad, badMsg: badMsg || undefined }
      return { ok: okCount > 0, count: okCount, error: errors[0], verify }
    } catch (e: any) {
      const msg = e?.message ?? '推送失败'
      set({ error: msg })
      return { ok: false, count: 0, error: msg }
    }
  },

  upload: async (remotePath, asset) => {
    const server = get().server
    if (!server) return false
    try {
      await openListFormUpload(server, remotePath, asset)
      await get().refresh()
      return true
    } catch (e: any) {
      set({ error: e?.message ?? '上传失败' })
      return false
    }
  },

  getDownloader: async () => {
    const s = get().server
    if (!s) return null
    const cached = await getDownloaderCached(s.id)
    if (cached) return cached
    const cur = s.downloader
    if (cur && cur.url) {
      await saveDownloaderCached(s.id, cur)
      return cur
    }
    return null
  },

  setDownloader: async (dl) => {
    const s = get().server
    set({ server: s ? { ...s, downloader: dl ?? undefined } : null })
    if (!s) return
    if (dl) await saveDownloaderCached(s.id, dl)
    else await clearDownloaderCached(s.id)
  },

  enterMultiSelect: () => set({ multiSelect: true }),
  exitMultiSelect: () => set({ multiSelect: false, selectedPaths: [] }),
  toggleSelect: (path) =>
    set((s) => ({
      selectedPaths: s.selectedPaths.includes(path)
        ? s.selectedPaths.filter((p) => p !== path)
        : [...s.selectedPaths, path],
    })),
  selectAll: () => set((s) => ({
    selectedPaths: s.files.map((f) => f.virtual_path ?? f.path ?? joinOpenListPath(s.path, f.name)).filter(Boolean),
  })),
  clearSelection: () => set({ selectedPaths: [] }),
}))

async function saveDownloaderCached(id: string, dl: NonNullable<OpenListServerConfig['downloader']>): Promise<void> {
  try { await AsyncStorage.setItem(DOWNLOADER_PREFIX + id, JSON.stringify(dl)) } catch {}
}

async function getDownloaderCached(id: string): Promise<NonNullable<OpenListServerConfig['downloader']> | null> {
  try {
    const raw = await AsyncStorage.getItem(DOWNLOADER_PREFIX + id)
    return raw ? (JSON.parse(raw) as NonNullable<OpenListServerConfig['downloader']>) : null
  } catch { return null }
}

async function clearDownloaderCached(id: string): Promise<void> {
  try { await AsyncStorage.removeItem(DOWNLOADER_PREFIX + id) } catch {}
}

/** 递归收集目录下所有文件的直链；相对根目录的子路径用于保目录结构（顶层目录名也会带上） */
async function collectOpenListFiles(
  server: OpenListServerConfig,
  dirPath: string,
  base: string,
  depth: number,
  out: { name: string; url: string; relDir: string }[],
): Promise<void> {
  if (out.length >= MAX_FILES) return
  const entries = await openListList(server, dirPath)
  const topName = base.split('/').filter(Boolean).pop() ?? ''
  for (const e of entries) {
    if (out.length >= MAX_FILES) return
    const full = joinOpenListPath(dirPath, e.name)
    if (e.is_dir) {
      if (depth < MAX_DEPTH) await collectOpenListFiles(server, full, base, depth + 1, out)
      continue
    }
    const rel = full.startsWith(base) ? full.slice(base.length).replace(/^\//, '') : ''
    const parentRel = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
    // 把 base 顶层目录名加到前缀：推送 /Movies/A 时，A/x.mp4 会落到 saveDir/A/，而非 saveDir/
    const finalRelDir = topName
      ? (parentRel ? `${topName}/${parentRel}` : topName)
      : parentRel
    try {
      const resolved = await openListResolveFileUrl(server, full)
      out.push({ name: e.name, url: resolved.url, relDir: finalRelDir })
    } catch {
      // skip files we can't resolve
    }
  }
}
