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
  rotational: boolean
  fsSize?: number
  fsUsed?: number
  fsFree?: number
  type?: 'data' | 'parity' | 'cache' | 'boot'
}

export interface UnraidArray {
  state: string
  capacity: { disks: { free: string; used: string; total: string } }
  disks: UnraidDisk[]
  parities: UnraidDisk[]
  caches: UnraidDisk[]
}

export interface VM {
  id: string
  name: string
  state: string
  vcpus?: number
  memory?: number
}

export interface ContainerDetail {
  id: string
  names: string[]
  image: string
  imageId: string
  command: string
  ports: Array<{ ip: string; privatePort: number; publicPort: number; type: string }>
  networkSettings: Record<string, any>
  labels: Record<string, string>
  isUpdateAvailable: boolean
  autoStart: boolean
}

export interface DashboardData {
  hostname: string
  uptime: string
  cpuModel: string
  cpuCores: number
  cpuThreads: number
  cpuSpeed: number
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

// ─── Jellyfin ───────────────────────────────────────────────────────────────

export interface JellyfinUser {
  Id: string
  Name: string
}

export interface JellyfinServerConfig {
  id: string
  name: string
  url: string
  username: string
  password: string
  userId?: string
  accessToken?: string
  userName?: string
}

export interface JellyfinLibrary {
  Name: string
  ItemId: string
  PrimaryImageItemId?: string
  CollectionType?: string
}

export interface JellyfinItem {
  Id: string
  Name: string
  Type: 'Movie' | 'Series' | 'Season' | 'Episode' | 'Audio' | 'MusicAlbum' | 'MusicArtist'
  ParentId?: string
  SeriesName?: string
  SeasonNumber?: number
  IndexNumber?: number
  ImageTags?: Record<string, string>
  BackdropImageTags?: string[]
  Overview?: string
  ProductionYear?: number
  Genres?: string[]
  CommunityRating?: number
  OfficialRating?: string
  RunTimeTicks?: number
  CollectionType?: string
  UserData?: {
    Played: boolean
    PlaybackPositionTicks?: number
    TotalRuntimeTicks?: number
  }
}

export interface JellyfinSeason {
  Id: string
  Name: string
  SeasonNumber: number
  SeriesId: string
  ImageTags?: Record<string, string>
}

export interface JellyfinPlaybackInfo {
  MediaSources: Array<{
    Id: string
    Path: string
    DirectStreamUrl: string
    SupportsDirectStream: boolean
    SupportsDirectPlay: boolean
  }>
}
