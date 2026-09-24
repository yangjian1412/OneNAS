import { apiFetch } from './client'
import type {
  JellyfinServerConfig,
  JellyfinUser,
  JellyfinLibrary,
  JellyfinItem,
  JellyfinSeason,
  JellyfinPlaybackInfo,
  JellyfinMediaSource,
  JellyfinSession,
  JellyfinSystemInfo,
  JellyfinLiveTvChannel,
} from '@/types'

export { type JellyfinServerConfig, type JellyfinUser }

const JELLYFIN_AUTH_HEADER = (
  clientName: string,
  deviceName: string,
  deviceId: string,
  clientVersion: string,
  token: string,
): string =>
  `MediaBrowser Client="${clientName}", Device="${deviceName}", DeviceId="${deviceId}", Version="${clientVersion}", Token="${token}"`

function buildAuthHeader(server: JellyfinServerConfig): string {
  return JELLYFIN_AUTH_HEADER(
    'One NAS',
    'Android',
    'one-nas-android',
    '1.0.0',
    server.accessToken ?? '',
  )
}

function jellyfinFetch<T>(
  server: JellyfinServerConfig,
  path: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const url = `${server.url}${path}`
  const headers: Record<string, string> = {
    Authorization: buildAuthHeader(server),
    ...(options.headers as Record<string, string>),
  }
  return apiFetch<T>(url, { ...options, headers })
}

async function jellyfinFetchWithFallback<T>(
  server: JellyfinServerConfig,
  primary: string,
  fallback: string,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const r = await jellyfinFetch<T>(server, primary)
  if (r.ok) return r
  return jellyfinFetch<T>(server, fallback)
}

export async function jellyfinLogin(
  serverUrl: string,
  username: string,
  password: string,
): Promise<{ ok: boolean; server?: JellyfinServerConfig; error?: string }> {
  const normalUrl = serverUrl.replace(/\/+$/, '')
  const url = `${normalUrl}/Users/AuthenticateByName`
  const result = await apiFetch<{
    User?: { Id: string; Name: string }
    AccessToken?: string
  }>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: JELLYFIN_AUTH_HEADER('One NAS', 'Android', 'one-nas-android', '1.0.0', ''),
    },
    body: JSON.stringify({ Username: username, Pw: password }),
  })

  if (!result.ok || !result.data?.User?.Id || !result.data?.AccessToken) {
    return { ok: false, error: result.error || 'Auth failed' }
  }

  const server: JellyfinServerConfig = {
    id: `jellyfin-${Date.now()}`,
    name: 'Jellyfin',
    url: normalUrl,
    username,
    password,
    userId: result.data.User.Id,
    userName: result.data.User.Name,
    accessToken: result.data.AccessToken,
  }
  return { ok: true, server }
}

export async function jellyfinGetLibraries(
  server: JellyfinServerConfig,
): Promise<{ ok: boolean; libraries?: JellyfinLibrary[]; error?: string }> {
  const result = await jellyfinFetch<{ Items?: JellyfinLibrary[] }>(
    server,
    `/Users/${server.userId}/Views`,
  )
  if (!result.ok) return { ok: false, error: result.error }
  const items = result.data?.Items ?? []
  const libs: JellyfinLibrary[] = items.map((v: any) => ({
    Name: v.Name,
    ItemId: v.Id,
    PrimaryImageItemId: v.ImageTags?.Primary ? v.Id : undefined,
    CollectionType: v.CollectionType,
    ImageTags: v.ImageTags,
  }))
  return { ok: true, libraries: libs }
}

export async function jellyfinGetRecentlyAdded(
  server: JellyfinServerConfig,
  libraryId: string,
  limit = 20,
): Promise<{ ok: boolean; items?: JellyfinItem[]; error?: string }> {
  const result = await jellyfinFetch<{ Items?: JellyfinItem[] }>(
    server,
    `/Items?parentId=${libraryId}&recentlyAdded=true&limit=${limit}&fields=ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,CanDelete,MediaSourceCount`,
  )
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, items: result.data?.Items ?? [] }
}

export async function jellyfinGetItem(
  server: JellyfinServerConfig,
  itemId: string,
): Promise<{ ok: boolean; item?: JellyfinItem; error?: string }> {
  if (!itemId) return { ok: false, error: 'Invalid item ID' }
  const result = await jellyfinFetch<JellyfinItem>(
    server,
    `/Users/${server.userId}/Items/${itemId}?fields=ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,CanDelete,MediaSourceCount,Overview,Genres,People,RunTimeTicks,OfficialRating,CommunityRating,ProductionYear,Studios,ImageTags,BackdropImageTags`,
  )
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, item: result.data }
}

export function jellyfinGetImageUrl(
  server: JellyfinServerConfig,
  itemId: string,
  imageType: 'Primary' | 'Backdrop' | 'Logo' = 'Primary',
  tag?: string,
  maxWidth?: number,
): string {
  let url = `${server.url}/Items/${itemId}/Images/${imageType}`
  const params: string[] = []
  if (tag) params.push(`tag=${tag}`)
  if (maxWidth) params.push(`maxWidth=${maxWidth}`)
  params.push(`ApiKey=${server.accessToken}`)
  if (params.length) url += `?${params.join('&')}`
  return url
}

export async function jellyfinGetSystemInfo(
  server: JellyfinServerConfig,
): Promise<{ ok: boolean; version?: string; info?: JellyfinSystemInfo; error?: string }> {
  const result = await jellyfinFetch<JellyfinSystemInfo>(server, '/System/Info')
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, version: result.data?.Version, info: result.data }
}

export async function jellyfinGetSessions(
  server: JellyfinServerConfig,
): Promise<{ ok: boolean; sessions?: JellyfinSession[]; error?: string }> {
  const result = await jellyfinFetch<JellyfinSession[]>(server, '/Sessions')
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, sessions: result.data ?? [] }
}

// ===== Cast / Remote control =====
// 原 v1.0.1beta 的 Jellyfin/Emby DLNA 投屏（经服务端 /Sessions）已废弃。
// 现在改为手机端原生 SSDP + UPnP 直接控制电视（src/lib/upnp/*），
// 不依赖 Jellyfin/Emby 服务端 DLNA server / 插件，电视与 Jellyfin 跨网段也能投屏。

export async function jellyfinRefreshLibrary(
  server: JellyfinServerConfig,
): Promise<{ ok: boolean; error?: string }> {
  const result = await jellyfinFetch<unknown>(server, '/Library/Media/Updated', { method: 'POST' })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}

export async function jellyfinRestartServer(
  server: JellyfinServerConfig,
): Promise<{ ok: boolean; error?: string }> {
  const result = await jellyfinFetch<unknown>(server, '/System/Restart', { method: 'POST' })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}

export async function jellyfinGetResumeItems(
  server: JellyfinServerConfig,
  limit = 12,
): Promise<{ ok: boolean; items?: JellyfinItem[]; error?: string }> {
  const result = await jellyfinFetch<{ Items?: JellyfinItem[] }>(
    server,
    `/Users/${server.userId}/Items/Resume?limit=${limit}&fields=PrimaryImageAspectRatio,BasicSyncInfo,MediaSourceCount,Overview,BackdropImageTags,ImageTags,SeriesPrimaryImageTag,SeriesThumbImageTag,SeriesBackdropImageTag,RunTimeTicks,ChildCount`,
  )
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, items: result.data?.Items ?? [] }
}

export async function jellyfinGetLibraryItems(
  server: JellyfinServerConfig,
  parentId: string,
  collectionType?: string,
  limit = 50,
  sortBy = 'SortName',
  sortOrder: 'Ascending' | 'Descending' = 'Ascending',
  startIndex = 0,
): Promise<{ ok: boolean; items?: JellyfinItem[]; totalRecordCount?: number; error?: string }> {
  if (!parentId) return { ok: false, error: 'Invalid parent ID' }

  const ct = (collectionType ?? '').toLowerCase()
  let includeTypes = ''
  let recursive = true
  switch (ct) {
    case 'movies': includeTypes = '&IncludeItemTypes=Movie'; recursive = true; break
    case 'tvshows': includeTypes = '&IncludeItemTypes=Series'; recursive = true; break
    case 'boxsets': includeTypes = '&IncludeItemTypes=BoxSet'; recursive = false; break
    case 'mixed':
    case 'folders':
    case 'homevideos':
    case 'music':
      includeTypes = '&IncludeItemTypes=Movie,Series&ExcludeItemTypes=CollectionFolder'; recursive = false; break
    default:
      includeTypes = '&IncludeItemTypes=Movie,Series&ExcludeItemTypes=CollectionFolder'; recursive = false
  }

  const result = await jellyfinFetch<{ Items?: JellyfinItem[]; TotalRecordCount?: number }>(
    server,
    `/Items?ParentId=${parentId}${includeTypes}&Recursive=${recursive}&SortBy=${sortBy}&SortOrder=${sortOrder}&limit=${limit}&startIndex=${startIndex}&fields=PrimaryImageAspectRatio,BasicSyncInfo,MediaSourceCount,Overview,Genres,ProductionYear,CommunityRating,BackdropImageTags,ImageTags,SeriesId,SeasonId,IndexNumber,SeasonNumber`,
  )
  if (!result.ok) return { ok: false, error: result.error }
  const items = (result.data?.Items ?? []).filter((i) => i.Id !== parentId)
  return { ok: true, items, totalRecordCount: result.data?.TotalRecordCount }
}

export async function jellyfinGetSeasons(
  server: JellyfinServerConfig,
  seriesId: string,
): Promise<{ ok: boolean; seasons?: JellyfinSeason[]; error?: string }> {
  if (!seriesId) return { ok: false, error: 'Invalid series ID' }
  const fields = 'ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,ImageTags,BackdropImageTags,Overview'
  const primary = `/Shows/${seriesId}/Seasons?userId=${server.userId}&fields=${fields}`
  const alt = `/Items?ParentId=${seriesId}&IncludeItemTypes=Season&fields=${fields}&Recursive=true`
  const alt2 = `/Users/${server.userId}/Items?ParentId=${seriesId}&IncludeItemTypes=Season&fields=${fields}&Recursive=true`
  const r1 = await jellyfinFetch<{ Items?: JellyfinSeason[] }>(server, primary)
  if (r1.ok) {
    const items = (r1.data?.Items ?? []).filter((s: any) => !s.Type || s.Type === 'Season')
    return { ok: true, seasons: items }
  }
  const r2 = await jellyfinFetch<{ Items?: JellyfinSeason[] }>(server, alt)
  if (r2.ok) {
    const items = (r2.data?.Items ?? []).filter((s: any) => !s.Type || s.Type === 'Season')
    return { ok: true, seasons: items }
  }
  const r3 = await jellyfinFetch<{ Items?: JellyfinSeason[] }>(server, alt2)
  if (r3.ok) {
    const items = (r3.data?.Items ?? []).filter((s: any) => !s.Type || s.Type === 'Season')
    return { ok: true, seasons: items }
  }
  return { ok: false, error: r1.error || r2.error || r3.error || '获取季信息失败' }
}

export async function jellyfinGetEpisodes(
  server: JellyfinServerConfig,
  seriesId: string,
  seasonId: string,
): Promise<{ ok: boolean; episodes?: JellyfinItem[]; error?: string }> {
  if (!seriesId || !seasonId) return { ok: false, error: 'Invalid series or season ID' }
  const fields = 'ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,MediaSourceCount,BackdropImageTags,ImageTags,Overview,IndexNumber'
  const primary = `/Shows/${seriesId}/Episodes?seasonId=${seasonId}&userId=${server.userId}&fields=${fields}`
  const alt = `/Items?ParentId=${seasonId}&IncludeItemTypes=Episode&fields=${fields}&Recursive=true`
  const alt2 = `/Users/${server.userId}/Items?ParentId=${seasonId}&IncludeItemTypes=Episode&fields=${fields}&Recursive=true`
  const r1 = await jellyfinFetch<{ Items?: JellyfinItem[] }>(server, primary)
  if (r1.ok) {
    const items = (r1.data?.Items ?? []).filter((s: any) => s.Type === 'Episode')
    return { ok: true, episodes: items }
  }
  const r2 = await jellyfinFetch<{ Items?: JellyfinItem[] }>(server, alt)
  if (r2.ok) {
    const items = (r2.data?.Items ?? []).filter((s: any) => s.Type === 'Episode')
    return { ok: true, episodes: items }
  }
  const r3 = await jellyfinFetch<{ Items?: JellyfinItem[] }>(server, alt2)
  if (r3.ok) {
    const items = (r3.data?.Items ?? []).filter((s: any) => s.Type === 'Episode')
    return { ok: true, episodes: items }
  }
  return { ok: false, error: r1.error || r2.error || r3.error || '获取剧集失败' }
}

// Minimal ExoPlayer/Media3 device profile. Sending a DeviceProfile is required
// for the server's MediaInfoHelper.SetDeviceSpecificData to compute
// DirectStreamUrl / TranscodingUrl on each MediaSource; without it the response
// only carries raw file info and playback falls back to stream.mp4.
const EXOPLAYER_DEVICE_PROFILE = {
  Name: 'One NAS ExoPlayer',
  MaxStreamingBitrate: 4000000,
  MaxStaticBitrate: 100000000,
  MusicStreamingTranscodingBitrate: 384000,
  DirectPlayProfiles: [
    {
      Container: 'ts,m3u8,mp4,m4v,mkv,webm,avi,mov',
      Type: 'Video',
      VideoCodec: 'h264,hevc,vp8,vp9,av1,mpeg4,mpeg2video',
      AudioCodec: 'aac,mp3,ac3,eac3,opus,flac,vorbis',
    },
    {
      Container: 'mp3,aac,m4a,flac,ogg,opus',
      Type: 'Audio',
      AudioCodec: 'aac,mp3,flac,opus,vorbis',
    },
  ],
  TranscodingProfiles: [
    {
      Container: 'ts',
      Type: 'Video',
      VideoCodec: 'h264',
      AudioCodec: 'aac,mp3,ac3,eac3',
      Context: 'Streaming',
      Protocol: 'hls',
      MaxAudioChannels: '6',
      EstimateContentLength: false,
      EnableMpegtsM2TsMode: false,
    },
    {
      Container: 'mp4',
      Type: 'Video',
      VideoCodec: 'h264',
      AudioCodec: 'aac,mp3',
      Context: 'Streaming',
      Protocol: 'http',
    },
    {
      Container: 'mp3',
      Type: 'Audio',
      AudioCodec: 'mp3',
      Context: 'Streaming',
      Protocol: 'http',
    },
  ],
  ContainerProfiles: [],
  CodecProfiles: [],
  SubtitleProfiles: [
    { Format: 'vtt', Type: 'External' },
    { Format: 'srt', Type: 'External' },
    { Format: 'ass', Type: 'External' },
    { Format: 'ttml', Type: 'Embedded' },
  ],
}

function withApiKey(server: JellyfinServerConfig, url: string): string {
  if (!url) return url
  // Absolutize FIRST: PlaybackInfo TranscodingUrl can be a relative path
  // (/Videos/{id}/master.m3u8?...) that already embeds ApiKey. Returning the
  // relative URL as-is makes ExoPlayer treat it as a local file path.
  const abs = /^https?:\/\//i.test(url) ? url : `${server.url}${url.startsWith('/') ? '' : '/'}${url}`
  if (/[?&]api_?key=/i.test(abs)) return abs
  if (!server.accessToken) return abs
  return abs.includes('?') ? `${abs}&ApiKey=${server.accessToken}` : `${abs}?ApiKey=${server.accessToken}`
}

export async function jellyfinGetStreamUrl(
  server: JellyfinServerConfig,
  itemId: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!itemId) return { ok: false, error: 'Invalid item ID' }
  const info = await jellyfinFetch<JellyfinPlaybackInfo>(server, `/Items/${itemId}/PlaybackInfo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      UserId: server.userId,
      StartTimeTicks: 0,
      IsPlayback: false,
      AutoOpenLiveStream: false,
      EnableDirectPlay: true,
      EnableDirectStream: true,
      EnableTranscoding: true,
      DeviceProfile: EXOPLAYER_DEVICE_PROFILE,
    }),
  })
  if (info.ok && info.data?.MediaSources?.length) {
    const source = info.data.MediaSources[0]
    const raw = source.TranscodingUrl || source.DirectStreamUrl
    if (raw) {
      return { ok: true, url: withApiKey(server, raw) }
    }
  }
  const streamUrl = `${server.url}/Videos/${itemId}/stream.mp4?ApiKey=${server.accessToken}&Static=true`
  return { ok: true, url: streamUrl }
}

// ─── Live TV ───────────────────────────────────────────────────────────────────
// Jellyfin exposes Live TV through a separate top-level endpoint tree:
//
//   GET /LiveTv/Channels                 — list all channels (sorted by Number)
//   GET /LiveTv/Channels/{id}            — single channel + current program
//   GET /LiveTv/Info                     — live tv system info; returns 404 if the
//                                          server has no tuner / no live tv enabled
//   GET /Videos/{channelId}/stream       — the actual media stream
//
// Items returned by /LiveTv/Channels share the same item Id namespace as
// /Videos/{id} and can be played via the standard JellyfinItem-style stream
// path. The ChannelType field carries "TVChannel" / "RadioChannel" / etc.
//
// Reference: https://api.jellyfin.org/ (LiveTvController)

export async function jellyfinGetLiveTvInfo(
  server: JellyfinServerConfig,
): Promise<{ ok: boolean; enabled: boolean; error?: string }> {
  const result = await jellyfinFetch<{ IsEnabled?: boolean }>(server, '/LiveTv/Info')
  if (!result.ok) {
    // 404 / 401 / 403 all mean "live tv unavailable" rather than a hard failure
    return { ok: true, enabled: false, error: result.error }
  }
  return { ok: true, enabled: !!result.data?.IsEnabled }
}

function mapChannels(items: any[]): JellyfinLiveTvChannel[] {
  return items
    .filter((v) => v && v.Id && v.Name)
    .map((v) => ({
      Id: v.Id,
      Name: v.Name,
      Number: v.Number,
      ChannelType: v.ChannelType,
      ImageTags: v.ImageTags,
    }))
}

export async function jellyfinGetLiveTvChannels(
  server: JellyfinServerConfig,
  liveTvLibraryId?: string,
): Promise<{ ok: boolean; channels?: JellyfinLiveTvChannel[]; error?: string; endpoint?: string }> {
  // Strategy 1: /LiveTv/Channels (admin / tuner-level listing). Requires the
  // authenticated user to have "Allow Live TV access" — a permission that lives
  // in the user's Library Access settings, not in the role. On a non-admin
  // account this endpoint may return 403 even though the Live TV library itself
  // is visible in /Users/{id}/Views.
  const r1 = await jellyfinFetch<{ Items?: any[] }>(
    server,
    `/LiveTv/Channels?userId=${server.userId}`,
  )
  if (r1.ok) {
    const channels = mapChannels(r1.data?.Items ?? [])
    return { ok: true, channels, endpoint: '/LiveTv/Channels' }
  }

  // Strategy 2: list TvChannel items inside the Live TV library. This goes
  // through the same /Items pipeline that powers Movies / TV Shows, so any user
  // who can see the Live TV entry in the library grid can also list its
  // children. The Live TV library ItemId comes from the Views list with
  // CollectionType = "livetv".
  if (liveTvLibraryId) {
    const r2 = await jellyfinFetch<{ Items?: any[]; TotalRecordCount?: number }>(
      server,
      `/Users/${server.userId}/Items?ParentId=${encodeURIComponent(liveTvLibraryId)}&IncludeItemTypes=TvChannel&Recursive=true&SortBy=SortName&fields=PrimaryImageAspectRatio,ImageTags`,
    )
    if (r2.ok) {
      const channels = mapChannels(r2.data?.Items ?? [])
      return { ok: true, channels, endpoint: `/Users/{id}/Items?ParentId=${liveTvLibraryId}` }
    }
    return { ok: false, error: `${r1.error}; fallback ${r2.error}`, endpoint: '/LiveTv/Channels' }
  }

  return { ok: false, error: r1.error, endpoint: '/LiveTv/Channels' }
}

// Direct stream URL for a live tv channel.
//
// Verified against Jellyfin 12.1.0 source + live probes on jf.liufenyi.xyz:
//
//   1. POST /Items/{channelId}/PlaybackInfo  — THE PlaybackInfo route
//      (MediaInfoController, GET also exists). Body carries PlaybackInfoDto
//      incl. DeviceProfile + AutoOpenLiveStream=true, which makes the server
//      open the live stream and return MediaSources[0] with TranscodingUrl
//      or DirectStreamUrl (+ LiveStreamId / PlaySessionId).
//
//   2. POST /LiveStreams/Open — only needed if the source comes back with
//      RequiresOpening=true and no LiveStreamId (rare when AutoOpen is set).
//
//   3. GET /Videos/{channelId}/stream?Static=true — server-side fallback;
//      empirically returns the channel's HLS playlist (application/
//      apple.mpegurl) even without PlaybackInfo.
//
// NOT real endpoints on this server (each 404s — these were the v1.0.5beta
// bugs): /LiveTv/Channels/{id}/PlaybackInfo (LiveTvController has no such
// route), /Videos/{id}/PlaybackInfo (405/404; correct route is /Items/{id}/),
// /LiveTv/Channels/{id}/stream.m3u8 (Lucky proxy 404s it in 0.09ms).
export async function jellyfinGetLiveTvStreamUrl(
  server: JellyfinServerConfig,
  channelId: string,
): Promise<{ ok: boolean; url?: string; error?: string; triedEndpoints?: string[] }> {
  if (!channelId) return { ok: false, error: 'Invalid channel ID' }
  if (!server.userId) return { ok: false, error: 'Missing user id' }

  const triedEndpoints: string[] = []

  const playbackBody = {
    UserId: server.userId,
    StartTimeTicks: 0,
    IsPlayback: true,
    AutoOpenLiveStream: true,
    MaxStreamingBitrate: 4000000,
    EnableDirectPlay: true,
    EnableDirectStream: true,
    EnableTranscoding: true,
    DeviceId: 'one-nas-android',
    DeviceProfile: EXOPLAYER_DEVICE_PROFILE,
  }
  const playbackQuery = new URLSearchParams({
    UserId: server.userId,
    StartTimeTicks: '0',
    IsPlayback: 'true',
    AutoOpenLiveStream: 'true',
    MaxStreamingBitrate: '4000000',
    EnableDirectPlay: 'true',
    EnableDirectStream: 'true',
    EnableTranscoding: 'true',
    DeviceId: 'one-nas-android',
  }).toString()

  const extractUrl = (
    data?: JellyfinPlaybackInfo,
  ): { url?: string; source?: JellyfinMediaSource } => {
    const source = data?.MediaSources?.[0]
    if (!source) return {}
    const raw = source.TranscodingUrl || source.DirectStreamUrl
    if (raw) return { url: withApiKey(server, raw), source }
    if (source.LiveStreamId && source.Id) {
      const params = new URLSearchParams({
        Static: 'true',
        MediaSourceId: source.Id,
        LiveStreamId: source.LiveStreamId,
        PlaySessionId: data?.PlaySessionId ?? '',
        DeviceId: 'one-nas-android',
      }).toString()
      return {
        url: withApiKey(server, `/Videos/${channelId}/stream?${params}`),
        source,
      }
    }
    return { source }
  }

  // ─── Step 1: POST /Items/{id}/PlaybackInfo (official flow) ─────────────
  // Critical params sent both in query (API-doc style) and body (DTO) so the
  // route binds them regardless of which side this Jellyfin build prefers.
  const postInfo = await jellyfinFetch<JellyfinPlaybackInfo>(
    server,
    `/Items/${encodeURIComponent(channelId)}/PlaybackInfo?${playbackQuery}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playbackBody),
    },
  )
  triedEndpoints.push('POST /Items/{id}/PlaybackInfo')

  if (postInfo.ok && postInfo.data) {
    const { url, source } = extractUrl(postInfo.data)
    if (url) {
      return { ok: true, url, triedEndpoints }
    }
    // Server returned a source that still needs explicit opening.
    if (source?.RequiresOpening && !source.LiveStreamId) {
      const open = await jellyfinFetch<JellyfinPlaybackInfo>(server, '/LiveStreams/Open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Id: source.Id,
          UserId: server.userId,
          DeviceProfile: EXOPLAYER_DEVICE_PROFILE,
          PlaySessionId: postInfo.data.PlaySessionId,
        }),
      })
      triedEndpoints.push('POST /LiveStreams/Open')
      if (open.ok && open.data) {
        const opened = extractUrl(open.data)
        if (opened.url) {
          return { ok: true, url: opened.url, triedEndpoints }
        }
      }
    }
  }

  // ─── Step 2: GET /Items/{id}/PlaybackInfo (legacy apiclient GET) ────────
  const getInfo = await jellyfinFetch<JellyfinPlaybackInfo>(
    server,
    `/Items/${encodeURIComponent(channelId)}/PlaybackInfo?${playbackQuery}`,
  )
  triedEndpoints.push('GET /Items/{id}/PlaybackInfo')
  if (getInfo.ok && getInfo.data) {
    const { url } = extractUrl(getInfo.data)
    if (url) {
      return { ok: true, url, triedEndpoints }
    }
  }

  // ─── Step 3: GET /Videos/{id}/stream?Static=true (server-side fallback) ─
  // Empirically returns the channel's HLS playlist on this server even when
  // PlaybackInfo yields no playable URL.
  const directUrl = withApiKey(
    server,
    `/Videos/${encodeURIComponent(channelId)}/stream?Static=true&DeviceId=one-nas-android`,
  )
  triedEndpoints.push('GET /Videos/{id}/stream?Static=true')

  return {
    ok: true,
    url: directUrl,
    error: postInfo.data?.ErrorCode
      ? `PlaybackInfo ErrorCode=${postInfo.data.ErrorCode}; using /Videos/{id}/stream fallback`
      : 'No TranscodingUrl/LiveStreamId from PlaybackInfo; using /Videos/{id}/stream fallback',
    triedEndpoints,
  }
}

export async function jellyfinSearch(
  server: JellyfinServerConfig,
  query: string,
  limit = 20,
): Promise<{ ok: boolean; results?: JellyfinItem[]; error?: string }> {
  const result = await jellyfinFetch<{ SearchHints?: Array<{ ItemId: string }> }>(
    server,
    `/Search/Hints?searchTerm=${encodeURIComponent(query)}&limit=${limit}&UserId=${server.userId}`,
  )
  if (!result.ok) return { ok: false, error: result.error }
  const hints = result.data?.SearchHints ?? []
  if (hints.length === 0) return { ok: true, results: [] }

  const items: JellyfinItem[] = []
  for (const hint of hints) {
    const r = await jellyfinGetItem(server, hint.ItemId)
    if (r.ok && r.item) items.push(r.item)
  }
  return { ok: true, results: items }
}
