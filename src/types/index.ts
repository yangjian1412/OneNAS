export type ServiceType =
  | 'jellyfin' | 'navidrome' | 'audiobookshelf'
  | 'immich' | 'filebrowser' | 'unraid' | 'custom'
  | 'aria2' | 'qbittorrent' | 'openlist'
  | 'talebook' | 'calibre'
  | 'emby'
  | 'komga'

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

// 文件管理后端：filebrowser（FileBrowser API）或 webdav（WebDAV 协议）
export type FileBackend = 'filebrowser' | 'webdav'

// WebDAV 独立配置（与 FileBrowser 配置并列，不共享字段）
export interface WebDavConfig {
  id: string
  name: string
  url: string         // e.g. https://host:port/dav
  username: string
  password: string
}

// NAS 管理后端：unraid（GraphQL docker mutations）或 portainer（Portainer REST API）
export type NasManagementBackend = 'unraid' | 'portainer'

// Portainer 独立配置（与 Unraid ServerConfig 并列，不共享字段）
export interface PortainerConfig {
  id: string
  name: string
  url: string         // e.g. http://nas-host:9000
  apiToken: string    // Portainer "Access Token" (X-Api-Key header)，永不过期
}

// Portainer 容器（映射 Docker API /containers/json 响应）
export interface PortainerContainer {
  Id: string
  Names: string[]
  Image: string
  ImageID?: string
  Command?: string
  Created: number
  State: string       // running / exited / paused / restarting / dead / created
  Status: string      // human-readable, e.g. "Up 5 minutes"
  Ports: Array<{ IP: string; PrivatePort: number; PublicPort: number; Type: string }>
  Labels: Record<string, string> | null
  NetworkSettings?: { Networks: Record<string, any> }
  Mounts?: Array<{ Name?: string; Source: string; Destination: string; Mode?: string; RW?: boolean; Type?: string }>
}

export interface PortainerEndpoint {
  Id: number
  Name: string
  Type: number        // 1=Docker, 2=Kubernetes, 3=AgentOnDocker, 4=AgentOnKubernetes
  Status: number      // 1=up, 2=down
  Url: string
}

export interface PortainerDashboardData {
  endpointId: number
  endpointName: string
  endpointUrl: string
  containers: PortainerContainer[]
}

// 导出配置格式
// - v1: 旧版明文（无 v/format 标记，服务/服务器数组直接暴露，含密码）
// - v2: 加密格式 { v, format:'enc-aes', cipher }
export interface ExportPayloadV2 {
  v: 2
  format: 'enc-aes'
  cipher: string   // CryptoJS.AES.encrypt(JSON.stringify(cfg), key).toString()
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

export interface JellyfinClientCapabilities {
  SupportsMediaControl?: boolean
  PlayableMediaTypes?: string[]
  SupportedCommands?: string[]
  SupportsPersistentIdentifier?: boolean
  SupportsSync?: boolean
}

export interface JellyfinSession {
  Id: string
  UserId: string
  UserName: string
  Client: string
  DeviceName: string
  DeviceId?: string
  DeviceType?: string
  Capabilities?: JellyfinClientCapabilities
  NowPlayingItem?: {
    Id: string
    Name: string
    Type: string
    SeriesName?: string
    SeasonName?: string
    EpisodeTitle?: string
    RunTimeTicks?: number
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
export type NavidromeLyricAlignment = 'left' | 'center' | 'right' | 'split'
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
  lyricOpacity: number
  lyricColor: number
  lyricBgAlpha: number
  lyricAlignment: NavidromeLyricAlignment
  lyricDesktopPositionY: number
  lyricDesktopSwapOrder: boolean
}

// ===== Audiobookshelf types =====

export interface AudiobookshelfServerConfig {
  id: string
  name: string
  url: string
  username: string
  password: string
  token?: string
  userId?: string
  userName?: string
  serverVersion?: string
}

export interface AudiobookshelfFolder {
  id: string
  fullPath: string
  libraryId: string
  addedAt: number
}

export interface AudiobookshelfLibrary {
  id: string
  name: string
  folders: AudiobookshelfFolder[]
  displayOrder: number
  icon: string
  mediaType: 'book' | 'podcast'
  provider: string
  createdAt: number
  lastUpdate: number
}

export interface AudiobookshelfFileMetadata {
  filename: string
  ext: string
  path: string
  relPath: string
  size: number
  mtimeMs: number
  ctimeMs: number
  birthtimeMs: number
}

export interface AudiobookshelfAudioFile {
  index: number
  ino: string
  metadata: AudiobookshelfFileMetadata
  addedAt: number
  updatedAt: number
  duration: number
  bitRate: number
  language?: string
  codec: string
  mimeType: string
  channels: number
  channelLayout: string
}

export interface AudiobookshelfChapter {
  id: number
  start: number
  end: number
  title: string
}

export interface AudiobookshelfTrack {
  index: number
  startOffset: number
  duration: number
  title: string
  contentUrl: string
  mimeType: string
  format?: string
  codec?: string
  bitRate?: number
  channels?: number
  metadata?: AudiobookshelfFileMetadata
}

export interface AudiobookshelfBookMetadata {
  title: string
  titleIgnorePrefix?: string
  subtitle?: string | null
  authorName?: string
  authorNameLF?: string
  narratorName?: string
  seriesName?: string
  genres: string[]
  publishedYear?: string | null
  publishedDate?: string | null
  publisher?: string | null
  description?: string | null
  isbn?: string | null
  asin?: string | null
  language?: string | null
  explicit?: boolean
}

export interface AudiobookshelfAuthor {
  id: string
  name: string
  asin?: string | null
  description?: string | null
  imagePath?: string | null
  addedAt: number
  updatedAt: number
  numBooks?: number
}

export interface AudiobookshelfSeries {
  id: string
  name: string
  description?: string | null
  addedAt: number
  updatedAt: number
  sequence?: string | null
  numBooks?: number
}

export interface AudiobookshelfBookMedia {
  libraryItemId: string
  metadata: AudiobookshelfBookMetadata
  coverPath?: string | null
  tags: string[]
  numTracks?: number
  numAudioFiles?: number
  numChapters?: number
  duration?: number
  size?: number
  audioFiles?: AudiobookshelfAudioFile[]
  chapters?: AudiobookshelfChapter[]
  tracks?: AudiobookshelfTrack[]
  ebookFile?: AudiobookshelfAudioFile | null
}

export interface AudiobookshelfPodcastEpisode {
  libraryItemId: string
  id: string
  index: number
  season?: string
  episode?: string
  episodeType?: string
  title: string
  subtitle?: string
  description?: string
  pubDate?: string
  publishedAt?: number
  addedAt: number
  updatedAt: number
  audioFile?: AudiobookshelfAudioFile
  audioTrack?: AudiobookshelfTrack
  duration?: number
  size?: number
}

export interface AudiobookshelfPodcastMedia {
  libraryItemId: string
  metadata: {
    title: string
    author?: string
    description?: string
    releaseDate?: string
    genres: string[]
    feedUrl?: string
    imageUrl?: string
    itunesPageUrl?: string
    itunesId?: number
    explicit?: boolean
    language?: string
    type?: string
  }
  coverPath?: string | null
  tags: string[]
  episodes: AudiobookshelfPodcastEpisode[]
}

export interface AudiobookshelfProgress {
  id: string
  libraryItemId: string
  episodeId?: string | null
  duration: number
  progress: number
  currentTime: number
  isFinished: boolean
  hideFromContinueListening: boolean
  lastUpdate: number
  startedAt: number
  finishedAt?: number | null
}

export interface AudiobookshelfBookmark {
  libraryItemId: string
  title?: string
  time: number
  createdAt: number
}

export interface AudiobookshelfLibraryItem {
  id: string
  ino?: string
  libraryId: string
  folderId?: string
  path: string
  relPath?: string
  addedAt: number
  updatedAt: number
  isMissing?: boolean
  isInvalid?: boolean
  mediaType: 'book' | 'podcast'
  media: AudiobookshelfBookMedia | AudiobookshelfPodcastMedia
  numFiles?: number
  size?: number
  userMediaProgress?: AudiobookshelfProgress | null
  recentEpisode?: AudiobookshelfPodcastEpisode | null
  progressLastUpdate?: number
}

export interface AudiobookshelfShelf<T> {
  id: string
  label: string
  labelStringKey?: string
  type: 'book' | 'podcast' | 'series' | 'authors' | 'episode'
  entities: T[]
  category?: string
}

export interface AudiobookshelfEbookFormat {
  ebookFileFormat: string | null
}

export interface AudiobookshelfPlaybackSession {
  id: string
  userId: string
  libraryId: string
  libraryItemId: string
  episodeId?: string | null
  mediaType: 'book' | 'podcast'
  audioTracks: AudiobookshelfTrack[]
  chapters: AudiobookshelfChapter[]
  displayTitle: string
  displayAuthor: string
  coverPath?: string
  duration: number
  playMethod: number
  mediaPlayer: string
  startTime: number
  currentTime: number
}

export interface AudiobookshelfUser {
  id: string
  username: string
  type: string
  token: string
  isActive: boolean
}

export interface AudiobookshelfSearchResult {
  libraryItem: AudiobookshelfLibraryItem
  matchKey: string
  matchText: string
}

export interface AudiobookshelfSearchResults {
  book?: AudiobookshelfSearchResult[]
  podcast?: AudiobookshelfSearchResult[]
  tags?: string[]
  authors?: AudiobookshelfAuthor[]
  series?: AudiobookshelfSeries[]
}

export interface AudiobookshelfPreferences {
  showContinueListening: boolean
  showRecentlyAdded: boolean
  showNewestAuthors: boolean
}

// ===== Talebook =====

export type TalebookLoginMode = 'code' | 'password' | 'guest' | ''

export interface TalebookServerConfig {
  id: string
  name: string
  url: string
  loginMode: TalebookLoginMode
  username: string
  password: string
  accessCode: string
  nickname?: string
  cookie?: string
  serverVersion?: string
}

export interface TalebookBook {
  id: number
  title: string
  authors: string[]
  publisher: string
  isbn?: string
  tags: string[]
  rating: number
  series?: string
  seriesIndex?: string
  comments: string
  pubdate: string
  cover: string
  img: string
  thumb: string
  fmtEpub: string
  fmtPdf: string
  fmtAzw3: string
  fmtMobi: string
  availableFormats: string
  countVisit: number
  countDownload: number
  scope: string
  timestamp: string
}

export interface TalebookBookFile {
  format: string
  size: number
  href: string
}

export interface TalebookBookDetail extends TalebookBook {
  files: TalebookBookFile[]
  language?: string
  collector?: string
  inShelf?: boolean
}

export interface TalebookIndexData {
  randomBooks: TalebookBook[]
  newBooks: TalebookBook[]
}

export interface TalebookUserInfo {
  isLogin: boolean
  isAdmin: boolean
  nickname: string
  username: string
  serverVersion: string
  bookCount: number
  title: string
}

// ===== Aria2 =====
export interface Aria2ServerConfig {
  id: string
  name: string
  url: string         // e.g. http://host:6800/jsonrpc
  secret: string      // rpc-secret; empty for none
}

export type Aria2TaskStatus = 'active' | 'waiting' | 'paused' | 'complete' | 'error' | 'removed'

export interface Aria2Task {
  gid: string
  status: Aria2TaskStatus
  totalLength: string
  completedLength: string
  downloadSpeed: string
  uploadSpeed: string
  files: Array<{
    path: string
    length: string
    completedLength: string
    selected: string
    uris: Array<{ uri: string; status: string }>
  }>
  dir: string
  errorCode?: string
  errorMessage?: string
}

export interface Aria2GlobalStat {
  downloadSpeed: string
  uploadSpeed: string
  numActive: string
  numWaiting: string
  numStopped: string
}

export interface Aria2Version {
  version: string
  enabledFeatures: string[]
}

// ===== qBittorrent =====
export interface QBittorrentServerConfig {
  id: string
  name: string
  url: string         // e.g. http://host:8080
  username: string
  password: string
  cookie?: string     // SID session cookie
}

export type QBitTorrentState = 'downloading' | 'uploading' | 'paused' | 'completed' | 'error' | 'missingFiles'

export interface QBitTorrentTask {
  hash: string
  name: string
  size: number
  progress: number      // 0-1
  dlspeed: number       // bytes/s
  upspeed: number       // bytes/s
  state: QBitTorrentState
  category?: string
  tags?: string
  added_on?: number
  completion_on?: number
  eta?: number
  save_path?: string
}

// ===== OpenList =====
export interface OpenListServerConfig {
  id: string
  name: string
  url: string         // e.g. http://host:5244
  username?: string   // 登录用户名（与 token 二选一）
  password?: string   // 登录密码
  token?: string      // admin jwt token (优先使用；若为空且有 username/password，会自动登录获取)
  // 下载工具（aria2）配置：保存在 OpenList 自己的 server 缓存，独立于全局服务配置。
  // 推送时由 app 前端直连该 aria2 RPC（参照 alist-web 的 sendToAria2 方式，保目录结构）。
  downloader?: {
    type: 'aria2'   // 目前仅支持 aria2
    url: string     // aria2 RPC 地址（含 /jsonrpc）
    secret: string  // rpc-secret；空表示无密钥
  }
}

export interface OpenListFile {
  name: string
  path: string
  virtual_path?: string
  size: number
  is_dir: boolean
  modified?: string
  sign?: string
  thumb?: string
}

// ===== WebDAV =====
// (WebDavConfig 已在文件顶部定义)

// ===== Komga =====
export interface KomgaServerConfig {
  id: string
  name: string
  url: string
  username: string
  password: string
  userId?: string
  userName?: string
  serverVersion?: string
}

export interface KomgaLibrary {
  id: string
  name: string
  root: string
  unavailable: boolean
}

export interface KomgaSeries {
  id: string
  libraryId: string
  name: string
  url: string
  booksCount: number
  booksReadCount: number
  booksUnreadCount: number
  booksInProgressCount: number
  oneshot: boolean
  created: string
  lastModified: string
  metadata: {
    title: string
    status?: string
    summary?: string
    publisher?: string
    language?: string
    genres: string[]
    tags: string[]
    ageRating?: number
    authors: Array<{ name: string; role: string }>
  }
}

export interface KomgaBook {
  id: string
  seriesId: string
  seriesTitle: string
  libraryId: string
  name: string
  number: number
  sortNumber: number
  url: string
  sizeBytes: number
  created: string
  lastModified: string
  media: {
    status: string
    mediaType: string
    pagesCount: number
    comment?: string
  }
  metadata: {
    title: string
    number: string
    summary?: string
    releaseDate?: string
    authors: Array<{ name: string; role: string }>
    tags: string[]
  }
  readProgress?: {
    page: number
    completed: boolean
    readDate?: string
    lastModified?: string
  }
  oneshot: boolean
}

export interface KomgaPage {
  number: number
  fileName: string
  mediaType: string
  width?: number
  height?: number
  sizeBytes?: number | null
  size?: string | null
}

export interface KomgaBookmark {
  id: string
  bookId: string
  page: number
  created: string
  kind?: string
}

export type KomgaSortKey = 'name' | 'added'
export type KomgaSortDir = 'asc' | 'desc'

