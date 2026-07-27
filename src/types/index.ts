export type ServiceType =
  | 'jellyfin' | 'navidrome' | 'audiobookshelf'
  | 'immich' | 'filebrowser' | 'unraid' | 'custom'
  | 'aria2' | 'calibre' | 'qbittorrent' | 'openlist'

type TabAssignment = 'none' | 'tab2' | 'tab3'

export interface ServiceConfig {
  id: string
  name: string
  type: ServiceType
  url: string
  category: string
  showInTopBar: boolean
  tabAssignment: TabAssignment
  sortOrder: number
  enabled: boolean
  authType: 'none' | 'basic' | 'token' | 'apikey'
  username?: string
  password?: string
  apiKey?: string
}

export interface ServerConfig {
  id: string
  name: string
  type: 'unraid' | 'filebrowser'
  host: string
  port: number
  protocol: 'http' | 'https'
  username?: string
  password?: string
  apiKey?: string
}

export interface FileItem {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modified: string
}

export interface Container {
  id: string
  names: string[]
  image: string
  state: string
  status: string
  autoStart: boolean
  ports: string
}

export interface SystemInfo {
  cpu: { manufacturer: string; brand: string; cores: number }
  memory: { total: number; free: number; used: number }
  uptime: string
}

export interface UnraidDisk {
  name: string
  device: string
  size: number
  temp: number
  status: string
  isSpinning: boolean
}

export interface UnraidArray {
  state: string
  capacity: { kilobytes: { free: number; used: number; total: number } }
  disks: UnraidDisk[]
}

export interface VM {
  id: string
  name: string
  state: string
  vcpus?: number
  memory?: number
}

export interface DashboardData {
  online: boolean
  hostname: string
  uptime: string
  cpuModel: string
  cpuCores: number
  cpuThreads: number
  cpuPercent: number
  memoryTotal: number
  memoryUsed: number
  memoryFree: number
  memoryPercent: number
  array: UnraidArray | null
  containers: Container[]
  vms: VM[]
}

export interface ShareInfo {
  hash: string
  path: string
  userID: number
  expire: number
  hasPassword: boolean
}

export type ThemeMode = 'light' | 'dark' | 'system'

export interface DownloadProgress {
  bytesDownloaded: number
  totalBytes: number
  status: 'pending' | 'running' | 'paused' | 'successful' | 'failed' | 'unknown'
  uri: string
  reason?: string
}

export interface DownloadTask {
  id: number
  fileName: string
  url: string
  progress: DownloadProgress
}
