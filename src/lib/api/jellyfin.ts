import { apiFetch } from './client'
import type {
  JellyfinServerConfig,
  JellyfinUser,
  JellyfinLibrary,
  JellyfinItem,
  JellyfinSeason,
  JellyfinPlaybackInfo,
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

export async function jellyfinLogin(
  serverUrl: string,
  username: string,
  password: string,
): Promise<{ ok: boolean; server?: JellyfinServerConfig; error?: string }> {
  const url = `${serverUrl}/Users/AuthenticateByName`
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
    url: serverUrl,
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
  const result = await jellyfinFetch<JellyfinLibrary[]>(
    server,
    '/Library/VirtualFolders',
  )
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, libraries: result.data ?? [] }
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
  const result = await jellyfinFetch<JellyfinItem>(
    server,
    `/Items/${itemId}?fields=ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,CanDelete,MediaSourceCount`,
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
): Promise<{ ok: boolean; version?: string; error?: string }> {
  const result = await jellyfinFetch<{ Version?: string }>(server, '/System/Info')
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, version: result.data?.Version }
}

export async function jellyfinGetResumeItems(
  server: JellyfinServerConfig,
  limit = 12,
): Promise<{ ok: boolean; items?: JellyfinItem[]; error?: string }> {
  const result = await jellyfinFetch<{ Items?: JellyfinItem[] }>(
    server,
    `/Users/${server.userId}/Items/Resume?limit=${limit}&fields=PrimaryImageAspectRatio,BasicSyncInfo,MediaSourceCount,Overview,BackdropImageTags`,
  )
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, items: result.data?.Items ?? [] }
}

export async function jellyfinGetLibraryItems(
  server: JellyfinServerConfig,
  parentId: string,
  limit = 50,
  sortBy = 'SortName',
): Promise<{ ok: boolean; items?: JellyfinItem[]; error?: string }> {
  const result = await jellyfinFetch<{ Items?: JellyfinItem[] }>(
    server,
    `/Items?ParentId=${parentId}&Recursive=true&SortBy=${sortBy}&SortOrder=Ascending&limit=${limit}&fields=PrimaryImageAspectRatio,BasicSyncInfo,MediaSourceCount,Overview,Genres,ProductionYear,CommunityRating,BackdropImageTags`,
  )
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, items: result.data?.Items ?? [] }
}

export async function jellyfinGetSeasons(
  server: JellyfinServerConfig,
  seriesId: string,
): Promise<{ ok: boolean; seasons?: JellyfinSeason[]; error?: string }> {
  const result = await jellyfinFetch<{ Items?: JellyfinSeason[] }>(
    server,
    `/Shows/${seriesId}/Seasons?fields=ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo`,
  )
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, seasons: result.data?.Items ?? [] }
}

export async function jellyfinGetEpisodes(
  server: JellyfinServerConfig,
  seriesId: string,
  seasonId: string,
): Promise<{ ok: boolean; episodes?: JellyfinItem[]; error?: string }> {
  const result = await jellyfinFetch<{ Items?: JellyfinItem[] }>(
    server,
    `/Shows/${seriesId}/Episodes?seasonId=${seasonId}&fields=ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,MediaSourceCount,BackdropImageTags`,
  )
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, episodes: result.data?.Items ?? [] }
}

export async function jellyfinGetStreamUrl(
  server: JellyfinServerConfig,
  itemId: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const info = await jellyfinFetch<JellyfinPlaybackInfo>(
    server,
    `/Videos/${itemId}/PlaybackInfo?UserId=${server.userId}&StartTimeMs=0&IsPlayback=false&AutoOpenLiveStream=false`,
  )
  if (!info.ok || !info.data?.MediaSources?.length) {
    return { ok: false, error: info.error || 'No playback info' }
  }
  const source = info.data.MediaSources[0]
  if (source.DirectStreamUrl) {
    const url = source.DirectStreamUrl.includes('?')
      ? `${source.DirectStreamUrl}&api_key=${server.accessToken}`
      : `${source.DirectStreamUrl}?api_key=${server.accessToken}`
    return { ok: true, url }
  }
  const streamUrl = `${server.url}/Videos/${itemId}/stream.mp4?api_key=${server.accessToken}`
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
