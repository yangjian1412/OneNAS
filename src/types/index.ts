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
  type?: string
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
  ImageTags?: Record<string, string>
}

export interface JellyfinItem {
  Id: string
  Name: string
  Type: 'Movie' | 'Series' | 'Season' | 'Episode' | 'Audio' | 'MusicAlbum' | 'MusicArtist' | 'Folder'
  ParentId?: string
  SeriesId?: string
  SeriesName?: string
  SeasonId?: string
  SeasonNumber?: number
  IndexNumber?: number
  ImageTags?: Record<string, string>
  BackdropImageTags?: string[]
  SeriesPrimaryImageTag?: string
  SeriesThumbImageTag?: string
  SeriesBackdropImageTag?: string
  Overview?: string
  ProductionYear?: number
  Genres?: string[]
  CommunityRating?: number
  OfficialRating?: string
  RunTimeTicks?: number
  CollectionType?: string
  People?: Array<{ Name: string; Role?: string; Type?: string; PrimaryImageTag?: string }>
  Studios?: Array<{ Name: string }>
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
  IndexNumber?: number
}

export interface JellyfinPlaybackInfo {
  MediaSources: JellyfinMediaSource[]
  PlaySessionId?: string
}

export interface JellyfinMediaSource {
  Id: string
  Path: string
  Container?: string
  DirectStreamUrl?: string
  SupportsDirectStream: boolean
  SupportsDirectPlay: boolean
  MediaStreams: JellyfinMediaStream[]
  Bitrate?: number
}

export interface JellyfinSession {
  Id: string
  UserId: string
  UserName: string
  Client: string
  DeviceName: string
  NowPlayingItem?: {
    Id: string
    Name: string
    Type: string
    SeriesName?: string
    SeasonName?: string
    EpisodeTitle?: string
  }
  PlayState?: {
    PositionTicks?: number
    IsPaused: boolean
  }
  LastActivityDate: string
}

export interface JellyfinSystemInfo {
  ServerName: string
  Version: string
  OperatingSystem: string
  StartTime: string
  Id: string
  CachePath: string
  LogPath: string
  InternalMetadataPath: string
  OperatingSystemDisplayName: string
}

export interface JellyfinMediaStream {
  Index: number
  Type: 'Video' | 'Audio' | 'Subtitle' | 'EmbeddedImage' | 'Data'
  Language?: string
  DisplayLanguage?: string
  Title?: string
  Codec?: string
  Channels?: number
  IsDefault?: boolean
  IsForced?: boolean
  IsExternal?: boolean
  DeliveryMethod?: 'Encode' | 'Embed' | 'External'
  DeliveryUrl?: string
  IsTextSubtitleStream?: boolean
}

export type PlaybackReportMethod = 'DirectPlay' | 'DirectStream' | 'Transcode'

export interface PlaybackProgressPayload {
  ItemId: string
  PositionTicks: number
  CanSeek?: boolean
  IsPaused: boolean
  IsMuted?: boolean
  Volume?: number
  PlayMethod?: PlaybackReportMethod
  RepeatMode?: 'RepeatNone' | 'RepeatOne' | 'RepeatAll'
  PlaybackOrder?: 'Default' | 'Shuffle'
  MediaSourceId?: string
  PlaySessionId?: string
  AudioStreamIndex?: number
  SubtitleStreamIndex?: number
}

export interface PlaybackStartInfo {
  ItemId: string
  CanSeek?: boolean
  IsPaused?: boolean
  IsMuted?: boolean
  PlayMethod?: PlaybackReportMethod
  MediaSourceId?: string
  AudioStreamIndex?: number
  SubtitleStreamIndex?: number
  MaxBitrate?: number
  StartPositionTicks?: number
}

// ─── Navidrome (Subsonic API) ──────────────────────────────────────────────

export interface NavidromeServerConfig {
  id: string
  name: string
  type?: string
  url: string
  username: string
  password: string
  // Subsonic auth
  authToken?: string   // hex(md5(password + salt))
  salt?: string        // random salt for token auth
  // cached user identity from subsonic-api ping
  userId?: string
  userName?: string
}

export interface NavidromeArtist {
  id: string
  name: string
  albumCount?: number
  coverArt?: string
  starred?: string
}

export interface NavidromeAlbum {
  id: string
  name: string
  title?: string  // some responses use title instead of name
  artist: string
  artistId?: string
  coverArt?: string
  songCount?: number
  duration?: number
  created?: string
  year?: number
  genre?: string
  starred?: string
  playCount?: number
}

export interface NavidromeSong {
  id: string
  parent?: string
  title: string
  album?: string
  albumId?: string
  artist?: string
  artistId?: string
  track?: number
  year?: number
  size?: number
  contentType?: string
  suffix?: string
  duration?: number
  bitRate?: number
  path?: string
  coverArt?: string
  starred?: string
  playCount?: number
  lastPlayed?: string
  created?: string
  type?: string
}

export interface NavidromePlaylist {
  id: string
  name: string
  comment?: string
  owner?: string
  public?: boolean
  songCount?: number
  duration?: number
  created?: string
  changed?: string
  coverArt?: string
}

export interface NavidromeLyricsLine {
  start: number
  value: string
  duration?: number
}

export interface NavidromeStructuredLyrics {
  lang: string
  synced: boolean
  line: NavidromeLyricsLine[]
  offset?: number
  displayArtist?: string
  displayTitle?: string
}

export interface NavidromeDirectory {
  id: string
  parent?: string
  title: string
  name?: string
  coverArt?: string
  childCount?: number
  isDir?: boolean
}

export interface NavidromePlayQueue {
  username?: string
  current?: string
  position?: number
  changed?: string
  changedBy?: string
  songs?: NavidromeSong[]
}

export type NavidromeLyricPosition = 'top' | 'middle' | 'bottom'

export interface NavidromePreferences {
  showRecentAlbums: boolean
  showMostPlayed: boolean
  showFreshAlbums: boolean
  showStarred: boolean
  showMusicFolders: boolean
  showPlaylists: boolean
  showPlayCount: boolean
  cacheSongs: boolean
  maxCacheMB: number
  lyricNotification: boolean
  lyricDesktop: boolean
  lyricInjectSystem: boolean
  lyricFontSize: number
  lyricOpacity: number
  lyricPosition: NavidromeLyricPosition
  lyricShowOnLockScreen: boolean
}
