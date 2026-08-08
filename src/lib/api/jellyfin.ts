import { apiFetch } from './client'
import type {
  JellyfinServerConfig,
  JellyfinUser,
  JellyfinLibrary,
  JellyfinItem,
  JellyfinSeason,
  JellyfinPlaybackInfo,
  JellyfinSession,
  JellyfinSystemInfo,
} from '@/types'

export { type JellyfinServerConfig, type JellyfinUser }

const EMBY_AUTH = 'MediaBrowser Client="One NAS", Device="Android", DeviceId="one-nas-android", Version="1.0.0"'

function jellyfinFetch<T>(
  server: JellyfinServerConfig,
  path: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const url = `${server.url}${path}`
  const headers: Record<string, string> = {
    'X-Emby-Authorization': EMBY_AUTH,
    ...(options.headers as Record<string, string>),
  }
  if (server.accessToken) {
    headers['X-Emby-Token'] = server.accessToken
    headers['Authorization'] = `MediaBrowser Token="${server.accessToken}"`
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
      'X-Emby-Authorization': EMBY_AUTH,
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
  params.push(`api_key=${server.accessToken}`)
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
// Jellyfin 服务端内置 DLNA server，把流推给电视等 UPnP 设备。
// 本 App 作为"控制端"，通过 /Sessions/{targetId}/Playing 让目标 session 接管播放。
// 客户端不需要实现任何 UPnP/DLNA 协议。

export interface JellyfinCastOptions {
  itemId: string
  startPositionTicks?: number
  mediaSourceId?: string
  audioStreamIndex?: number
  subtitleStreamIndex?: number
}

export async function jellyfinCast(
  server: JellyfinServerConfig,
  targetSessionId: string,
  options: JellyfinCastOptions,
): Promise<{ ok: boolean; error?: string }> {
  const params = new URLSearchParams()
  params.set('ItemIds', options.itemId)
  params.set('PlayCommand', 'PlayNow')
  if (options.startPositionTicks != null) params.set('StartPositionTicks', String(options.startPositionTicks))
  if (options.mediaSourceId) params.set('MediaSourceId', options.mediaSourceId)
  if (options.audioStreamIndex != null) params.set('AudioStreamIndex', String(options.audioStreamIndex))
  if (options.subtitleStreamIndex != null) params.set('SubtitleStreamIndex', String(options.subtitleStreamIndex))
  const r = await jellyfinFetch<unknown>(server, `/Sessions/${encodeURIComponent(targetSessionId)}/Playing?${params.toString()}`, { method: 'POST' })
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true }
}

export type JellyfinPlaystateCommand =
  | 'Stop'
  | 'Pause'
  | 'Unpause'
  | 'NextTrack'
  | 'PreviousTrack'
  | 'Seek'
  | 'Rewind'
  | 'FastForward'
  | 'PlayPause'
  | 'Mute'
  | 'Unmute'
  | 'SetVolume'
  | 'SetAudioStreamIndex'
  | 'SetSubtitleStreamIndex'

export async function jellyfinSendPlaystate(
  server: JellyfinServerConfig,
  targetSessionId: string,
  command: JellyfinPlaystateCommand,
  seekPositionTicks?: number,
): Promise<{ ok: boolean; error?: string }> {
  const params = new URLSearchParams()
  if (seekPositionTicks != null && (command === 'Seek' || command === 'Rewind' || command === 'FastForward')) {
    params.set('SeekPositionTicks', String(seekPositionTicks))
  }
  const qs = params.toString()
  const url = `/Sessions/${encodeURIComponent(targetSessionId)}/Playing/${command}${qs ? `?${qs}` : ''}`
  const r = await jellyfinFetch<unknown>(server, url, { method: 'POST' })
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true }
}

export async function jellyfinGetSessionById(
  server: JellyfinServerConfig,
  sessionId: string,
): Promise<{ ok: boolean; session?: JellyfinSession; error?: string }> {
  const r = await jellyfinGetSessions(server)
  if (!r.ok) return { ok: false, error: r.error }
  const target = (r.sessions ?? []).find((s) => s.Id === sessionId)
  if (!target) return { ok: false, error: 'session 已离线' }
  return { ok: true, session: target }
}

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
): Promise<{ ok: boolean; items?: JellyfinItem[]; error?: string }> {
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

  const result = await jellyfinFetch<{ Items?: JellyfinItem[] }>(
    server,
    `/Items?ParentId=${parentId}${includeTypes}&Recursive=${recursive}&SortBy=${sortBy}&SortOrder=${sortOrder}&limit=${limit}&fields=PrimaryImageAspectRatio,BasicSyncInfo,MediaSourceCount,Overview,Genres,ProductionYear,CommunityRating,BackdropImageTags,ImageTags,SeriesId,SeasonId,IndexNumber,SeasonNumber`,
  )
  if (!result.ok) return { ok: false, error: result.error }
  const items = (result.data?.Items ?? []).filter((i) => i.Id !== parentId)
  return { ok: true, items }
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

export async function jellyfinGetStreamUrl(
  server: JellyfinServerConfig,
  itemId: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!itemId) return { ok: false, error: 'Invalid item ID' }
  const info = await jellyfinFetch<JellyfinPlaybackInfo>(
    server,
    `/Videos/${itemId}/PlaybackInfo?UserId=${server.userId}&StartTimeMs=0&IsPlayback=false&AutoOpenLiveStream=false`,
  )
  if (info.ok && info.data?.MediaSources?.length) {
    const source = info.data.MediaSources[0]
    if (source.DirectStreamUrl) {
      const url = source.DirectStreamUrl.includes('?')
        ? `${source.DirectStreamUrl}&api_key=${server.accessToken}`
        : `${source.DirectStreamUrl}?api_key=${server.accessToken}`
      return { ok: true, url }
    }
  }
  const streamUrl = `${server.url}/Videos/${itemId}/stream.mp4?api_key=${server.accessToken}&Static=true`
  return { ok: true, url: streamUrl }
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
