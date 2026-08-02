import { create } from 'zustand'
import { ServerConfig, ServiceConfig, Container, SystemInfo, ThemeMode, DownloadTask, ExportPayloadV2 } from '@/types'
import { loadItem, saveItem } from '@/lib/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import CryptoJS from 'crypto-js'

export type FileSortBy = 'name' | 'size' | 'modified'
export type FileSortDir = 'asc' | 'desc'
export interface FileSort {
  by: FileSortBy
  dir: FileSortDir
}

interface PersistPayload {
  servers: ServerConfig[]
  services: ServiceConfig[]
  theme: ThemeMode
  hideNasManagement: boolean
  hideTabLabels: boolean
  fileSort: FileSort
  downloads: DownloadTask[]
}

async function persist(s: AppState, extra?: Partial<PersistPayload>) {
  const payload: PersistPayload = {
    servers: extra?.servers ?? s.servers,
    services: extra?.services ?? s.services,
    theme: extra?.theme ?? s.theme,
    hideNasManagement: extra?.hideNasManagement ?? s.hideNasManagement,
    hideTabLabels: extra?.hideTabLabels ?? s.hideTabLabels,
    fileSort: extra?.fileSort ?? s.fileSort,
  }
  await saveItem(STORAGE_KEYS.CONFIG, JSON.stringify(payload))
}

// 统一清洗：清除旧版 calibre 残留，保证每个服务类型只有一条真实配置。
// - type 为 calibre 且无 url ⇒ 纯占位，直接删除
// - type 为 calibre 且有 url ⇒ 转成 talebook（保守，避免误删真实配置）
// - talebook 按 url 去重
function normalizeServices(services: any[]): ServiceConfig[] {
  const out: ServiceConfig[] = []
  for (const s of services) {
    if (!s) continue
    const type = String(s.type ?? '').toLowerCase()
    const url = String(s.url ?? '')
    if (type === 'calibre') {
      if (!url) continue
      out.push({ ...s, type: 'talebook' as ServiceConfig['type'] })
      continue
    }
    // 空地址的占位残留（如导入的数据里 name=Calibre、type=talebook、url=空）直接丢弃，
    // 避免设置页 find() 匹配到该空条目导致标签名/开关错乱
    if (type === 'talebook' && !url) continue
    out.push(s)
  }
  // talebook 按 url 去重
  const seenTalebook = new Set<string>()
  return out.filter((s) => {
    if (s.type === 'talebook') {
      const key = `talebook:${String(s.url ?? '')}`
      if (seenTalebook.has(key)) return false
      seenTalebook.add(key)
    }
    return true
  })
}

export interface AppState {
  loaded: boolean
  servers: ServerConfig[]
  services: ServiceConfig[]
  containers: Container[]
  systemInfo: SystemInfo | null
  theme: ThemeMode
  hideNasManagement: boolean
  hideTabLabels: boolean
  fileSort: FileSort

  init: () => Promise<void>

  setServers: (servers: ServerConfig[]) => void
  addServer: (server: ServerConfig) => void
  updateServer: (id: string, server: ServerConfig) => void
  deleteServer: (id: string) => void

  setServices: (services: ServiceConfig[]) => void
  addService: (service: ServiceConfig) => void
  updateService: (id: string, partial: Partial<ServiceConfig>) => void
  deleteService: (id: string) => void

  setContainers: (containers: Container[]) => void
  setSystemInfo: (info: SystemInfo | null) => void
  setTheme: (theme: ThemeMode) => void
  setHideNasManagement: (hidden: boolean) => void
  setHideTabLabels: (hidden: boolean) => void
  setFileSort: (sort: FileSort) => void
  addDownload: (task: DownloadTask) => void
  updateDownload: (task: DownloadTask) => void
  removeDownload: (id: number) => void
  clearDownloads: () => void

  importConfig: (json: string, key?: string) => Promise<{ ok: boolean; error?: string }>
  exportConfig: (key: string) => Promise<string>
}

export const useAppStore = create<AppState>((set, get) => ({
  loaded: false,
  servers: [],
  services: [],
  containers: [],
  systemInfo: null,
  theme: 'system',
  hideNasManagement: false,
  hideTabLabels: true,
  fileSort: { by: 'name', dir: 'asc' },
  downloads: [],

  init: async () => {
    try {
      const raw = await loadItem<string>(STORAGE_KEYS.CONFIG)
      if (!raw) {
        set({ loaded: true })
        return
      }

      const cfg = JSON.parse(raw)
      const servers = cfg.servers ?? []
      const services = normalizeServices(cfg.services ?? [])
      const theme = cfg.theme ?? 'system'
      const hideNasManagement = cfg.hideNasManagement ?? false
      const hideTabLabels = cfg.hideTabLabels ?? true
      const fileSort = cfg.fileSort ?? { by: 'name', dir: 'asc' }
      set({
        loaded: true,
        servers,
        services,
        theme,
        hideNasManagement,
        hideTabLabels,
        fileSort,
      })
      // 落盘：真正把残留（如空 url 的 calibre 占位）从磁盘清除
      void persist(get(), { servers, services, theme, hideNasManagement, hideTabLabels, fileSort })
    } catch {
      set({ loaded: true })
    }
  },

  setServers: (servers) => { set({ servers }); persist(get(), { servers }) },
  addServer: (server) => { const servers = [...get().servers, server]; set({ servers }); persist(get(), { servers }) },
  updateServer: (id, updated) => { const servers = get().servers.map((s) => (s.id === id ? updated : s)); set({ servers }); persist(get(), { servers }) },
  deleteServer: (id) => { const servers = get().servers.filter((s) => s.id !== id); set({ servers }); persist(get(), { servers }) },

  setServices: (services) => { set({ services }); persist(get(), { services }) },
  addService: (service) => { const services = [...get().services, service]; set({ services }); persist(get(), { services }) },
  updateService: (id, partial) => {
    const services = get().services.map((s) => (s.id === id ? { ...s, ...partial } : s))
    set({ services }); persist(get(), { services })
  },
  deleteService: (id) => { const services = get().services.filter((s) => s.id !== id); set({ services }); persist(get(), { services }) },

  setContainers: (containers) => set({ containers }),
  setSystemInfo: (systemInfo) => set({ systemInfo }),
  setTheme: (theme) => { set({ theme }); persist(get(), { theme }) },
  setHideNasManagement: (hideNasManagement) => { set({ hideNasManagement }); persist(get(), { hideNasManagement }) },
  setHideTabLabels: (hideTabLabels) => { set({ hideTabLabels }); persist(get(), { hideTabLabels }) },
  setFileSort: (fileSort) => { set({ fileSort }); persist(get(), { fileSort }) },
  addDownload: (task) => set((state) => ({ downloads: [...state.downloads, task] })),
  updateDownload: (task) => set((state) => ({ downloads: state.downloads.map((item) => item.id === task.id ? task : item) })),
  removeDownload: (id) => set((state) => ({ downloads: state.downloads.filter((item) => item.id !== id) })),
  clearDownloads: () => set({ downloads: [] }),

  importConfig: async (json: string, key?: string) => {
    let cfg: any
    try {
      cfg = JSON.parse(json)
    } catch {
      return { ok: false, error: '配置格式错误，无法解析' }
    }

    // v2 加密格式：必须用密钥解密
    if (cfg && cfg.v === 2 && cfg.format === 'enc-aes') {
      if (!key || !key.trim()) return { ok: false, error: '该配置已加密，请输入密钥' }
      let plain: string | null = null
      try {
        plain = CryptoJS.AES.decrypt(cfg.cipher, key.trim()).toString(CryptoJS.enc.Utf8)
      } catch {
        plain = null
      }
      if (!plain || !plain.startsWith('{')) return { ok: false, error: '密钥错误，无法解密导入' }
      try {
        cfg = JSON.parse(plain)
      } catch {
        return { ok: false, error: '解密成功但配置内容损坏' }
      }
    }

    const servers = cfg.servers ?? []
    const services = normalizeServices(cfg.services ?? [])
    const theme = cfg.theme ?? 'light'
    const hideNasManagement = cfg.hideNasManagement ?? false
    const hideTabLabels = cfg.hideTabLabels ?? true
    const fileSort = cfg.fileSort ?? { by: 'name', dir: 'asc' }
    set({ servers, services, theme, hideNasManagement, hideTabLabels, fileSort })
    await persist(get(), { servers, services, theme, hideNasManagement, hideTabLabels, fileSort })
    return { ok: true }
  },

  exportConfig: async (key: string) => {
    const s = get()
    const cfg = JSON.stringify({
      servers: s.servers,
      services: s.services,
      theme: s.theme,
      hideNasManagement: s.hideNasManagement,
      hideTabLabels: s.hideTabLabels,
      fileSort: s.fileSort,
    })
    // v2 加密格式：密钥（默认 "0"）AES 加密，导出含密码也行，但不含明文
    const cipher = CryptoJS.AES.encrypt(cfg, key || '0').toString()
    const payload: ExportPayloadV2 = { v: 2, format: 'enc-aes', cipher }
    return JSON.stringify(payload, null, 2)
  },
}))

export function getTab2Service(services: ServiceConfig[]): ServiceConfig | undefined {
  return services.find((s) => s.tabAssignment === 'tab2' && s.enabled && s.type !== 'immich')
}

export function getTab3Service(services: ServiceConfig[]): ServiceConfig | undefined {
  return services.find((s) => s.tabAssignment === 'tab3' && s.enabled && s.type !== 'immich')
}

export function getTopBarServices(services: ServiceConfig[]): ServiceConfig[] {
  return services.filter((s) => s.showInTopBar && s.enabled).sort((a, b) => a.sortOrder - b.sortOrder)
}
