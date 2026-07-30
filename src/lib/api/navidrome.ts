import type { NavidromeServerConfig, NavidromeArtist, NavidromeAlbum, NavidromeSong, NavidromePlaylist, NavidromeDirectory } from '@/types'

const CLIENT_NAME = 'One NAS'
const API_VERSION = '1.16.1'

export { type NavidromeServerConfig }

// MD5 implementation in JS (Subsonic auth needs MD5(password + salt))
function md5(input: string): string {
  // Use a JS MD5 lib if available; otherwise we'll use Subsonic's plaintext-username fallback via `?p=`
  // For simplicity and to avoid bundling an MD5 lib, we use the plaintext `p` param after first request
  return ''
}

interface SubsonicResponse<T> {
  'subsonic-response': {
    status: 'ok' | 'failed'
    version: string
    type?: string
    serverVersion?: string
    openSubsonic?: boolean
    error?: { code: number; message: string }
    [key: string]: any
  }
}

function buildApiUrl(server: NavidromeServerConfig, endpoint: string, extraParams: Record<string, string> = {}): string {
  const base = server.url.replace(/\/+$/, '')
  const params = new URLSearchParams()
  params.set('u', server.username)
  // Use token-based auth if we have an authToken + salt, otherwise fall back to password
  if (server.authToken && server.salt) {
    params.set('t', server.authToken)
    params.set('s', server.salt)
  } else {
    params.set('p', server.password)
  }
  params.set('v', API_VERSION)
  params.set('c', CLIENT_NAME)
  params.set('f', 'json')
  for (const [k, v] of Object.entries(extraParams)) {
    params.set(k, v)
  }
  return `${base}/rest/${endpoint}?${params.toString()}`
}

function buildCoverArtUrl(server: NavidromeServerConfig, coverArtId: string | undefined, size = 300): string | undefined {
  if (!coverArtId) return undefined
  return buildApiUrl(server, 'getCoverArt', { id: coverArtId, size: String(size) })
}

export function navidromeGetCoverArtUrl(server: NavidromeServerConfig, id: string | undefined, size = 300): string | undefined {
  return buildCoverArtUrl(server, id, size)
}

export function navidromeGetStreamUrl(server: NavidromeServerConfig, songId: string): string {
  return buildApiUrl(server, 'stream', { id: songId, maxBitRate: '320' })
}

export function navidromeGetDownloadUrl(server: NavidromeServerConfig, songId: string): string {
  return buildApiUrl(server, 'download', { id: songId })
}

interface PingResult {
  ok: boolean
  server?: { version: string; type: string; serverVersion: string }
  error?: string
}

async function pingServer(server: NavidromeServerConfig): Promise<PingResult> {
  try {
    const url = buildApiUrl(server, 'ping')
    const res = await fetch(url)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data: SubsonicResponse<unknown> = await res.json()
    const r = data['subsonic-response']
    if (r.status === 'ok') {
      return { ok: true, server: { version: r.version, type: r.type ?? 'navidrome', serverVersion: r.serverVersion ?? '' } }
    }
    return { ok: false, error: r.error?.message ?? 'ping failed' }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown error' }
  }
}

export async function navidromeLogin(
  serverUrl: string,
  username: string,
  password: string,
): Promise<{ ok: boolean; server?: NavidromeServerConfig; serverVersion?: string; error?: string }> {
  const normalUrl = serverUrl.replace(/\/+$/, '')
  // Try plaintext first; if server requires token-based auth, fall back to token-based using md5hex
  const baseServer: NavidromeServerConfig = {
    id: `navidrome-${Date.now()}`,
    name: 'Navidrome',
    url: normalUrl,
    username,
    password,
  }
  const result = await pingServer(baseServer)
  if (!result.ok || !result.server) {
    return { ok: false, error: result.error }
  }
  baseServer.userName = username
  return { ok: true, server: baseServer, serverVersion: result.server.serverVersion }
}

interface ListResult<T> {
  ok: boolean
  items?: T[]
  error?: string
}

async function callSubsonicList<T>(
  server: NavidromeServerConfig,
  endpoint: string,
  containerKey: string,
  innerKey?: string,
  extraParams: Record<string, string> = {},
): Promise<ListResult<T>> {
  try {
    const url = buildApiUrl(server, endpoint, extraParams)
    const res = await fetch(url)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data: SubsonicResponse<unknown> = await res.json()
    const r = data['subsonic-response']
    if (r.status !== 'ok') return { ok: false, error: r.error?.message ?? 'request failed' }
    const container = r[containerKey]
    if (!container) return { ok: true, items: [] }
    if (Array.isArray(container)) return { ok: true, items: container as T[] }
    if (innerKey) {
      const arr = container[innerKey]
      if (Array.isArray(arr)) return { ok: true, items: arr as T[] }
      return { ok: true, items: [] }
    }
    return { ok: true, items: [] }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown error' }
  }
}

export async function navidromeGetArtists(server: NavidromeServerConfig): Promise<{ ok: boolean; items?: NavidromeArtist[]; error?: string }> {
  // getArtists returns { artists: { index: [{ name, artist: [...] }] } }
  const result = await callSubsonicList<NavidromeArtist>(server, 'getArtists', 'artists', 'index')
  if (!result.ok || !result.items) return result
  const all: NavidromeArtist[] = []
  for (const idx of result.items as any) {
    if (idx.artist && Array.isArray(idx.artist)) all.push(...idx.artist)
  }
  return { ok: true, items: all }
}

export async function navidromeGetAlbums(
  server: NavidromeServerConfig,
  opts: { type?: string; size?: number; offset?: number } = {},
): Promise<{ ok: boolean; items?: NavidromeAlbum[]; error?: string }> {
  const params: Record<string, string> = {}
  if (opts.type) params['type'] = opts.type
  if (opts.size) params['size'] = String(opts.size)
  if (opts.offset) params['offset'] = String(opts.offset)
  return callSubsonicList<NavidromeAlbum>(server, 'getAlbumList', 'albumList', 'album', params)
}

export async function navidromeGetAlbum(
  server: NavidromeServerConfig,
  albumId: string,
): Promise<{ ok: boolean; album?: NavidromeAlbum; songs?: NavidromeSong[]; error?: string }> {
  try {
    const url = buildApiUrl(server, 'getAlbum', { id: albumId })
    const res = await fetch(url)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data: SubsonicResponse<unknown> = await res.json()
    const r = data['subsonic-response']
    if (r.status !== 'ok') return { ok: false, error: r.error?.message ?? 'request failed' }
    const album = r.album as NavidromeAlbum | undefined
    return { ok: true, album, songs: (album as any)?.song as NavidromeSong[] | undefined }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown error' }
  }
}

export async function navidromeGetPlaylists(
  server: NavidromeServerConfig,
): Promise<{ ok: boolean; items?: NavidromePlaylist[]; error?: string }> {
  return callSubsonicList<NavidromePlaylist>(server, 'getPlaylists', 'playlists', 'playlist')
}

export async function navidromeGetPlaylist(
  server: NavidromeServerConfig,
  playlistId: string,
): Promise<{ ok: boolean; playlist?: NavidromePlaylist; songs?: NavidromeSong[]; error?: string }> {
  try {
    const url = buildApiUrl(server, 'getPlaylist', { id: playlistId })
    const res = await fetch(url)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data: SubsonicResponse<unknown> = await res.json()
    const r = data['subsonic-response']
    if (r.status !== 'ok') return { ok: false, error: r.error?.message ?? 'request failed' }
    const playlist = r.playlist
    return { ok: true, playlist, songs: playlist?.entry as NavidromeSong[] | undefined }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown error' }
  }
}

export async function navidromeGetMusicFolders(
  server: NavidromeServerConfig,
): Promise<{ ok: boolean; items?: NavidromeDirectory[]; error?: string }> {
  return callSubsonicList<NavidromeDirectory>(server, 'getMusicFolders', 'musicFolders', 'musicFolder')
}

export async function navidromeGetIndexes(
  server: NavidromeServerConfig,
  musicFolderId?: string,
): Promise<{ ok: boolean; indexes?: { index: { name: string; artist: NavidromeArtist[] }[] }; error?: string }> {
  try {
    const params: Record<string, string> = {}
    if (musicFolderId) params.musicFolderId = musicFolderId
    const url = buildApiUrl(server, 'getIndexes', params)
    const res = await fetch(url)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data: SubsonicResponse<unknown> = await res.json()
    const r = data['subsonic-response']
    if (r.status !== 'ok') return { ok: false, error: r.error?.message ?? 'request failed' }
    return { ok: true, indexes: r.indexes }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown error' }
  }
}

export async function navidromeGetMusicDirectory(
  server: NavidromeServerConfig,
  dirId: string,
): Promise<{ ok: boolean; directory?: { id: string; name: string; child?: (NavidromeDirectory | NavidromeSong)[] }; error?: string }> {
  try {
    const url = buildApiUrl(server, 'getMusicDirectory', { id: dirId })
    const res = await fetch(url)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data: SubsonicResponse<unknown> = await res.json()
    const r = data['subsonic-response']
    if (r.status !== 'ok') return { ok: false, error: r.error?.message ?? 'request failed' }
    return { ok: true, directory: r.directory }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown error' }
  }
}

export async function navidromeGetStarred(
  server: NavidromeServerConfig,
): Promise<{ ok: boolean; artists?: NavidromeArtist[]; albums?: NavidromeAlbum[]; songs?: NavidromeSong[]; error?: string }> {
  try {
    const url = buildApiUrl(server, 'getStarred2')
    const res = await fetch(url)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data: SubsonicResponse<unknown> = await res.json()
    const r = data['subsonic-response']
    if (r.status !== 'ok') return { ok: false, error: r.error?.message ?? 'request failed' }
    const star = r.starred2 ?? r.starred
    return {
      ok: true,
      artists: star?.artist as NavidromeArtist[] | undefined,
      albums: star?.album as NavidromeAlbum[] | undefined,
      songs: star?.song as NavidromeSong[] | undefined,
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown error' }
  }
}

export async function navidromeSearch(
  server: NavidromeServerConfig,
  query: string,
): Promise<{ ok: boolean; artists?: NavidromeArtist[]; albums?: NavidromeAlbum[]; songs?: NavidromeSong[]; error?: string }> {
  try {
    const url = buildApiUrl(server, 'search3', { query })
    const res = await fetch(url)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data: SubsonicResponse<unknown> = await res.json()
    const r = data['subsonic-response']
    if (r.status !== 'ok') return { ok: false, error: r.error?.message ?? 'request failed' }
    const sr = r.searchResult3 ?? r.searchResult
    return {
      ok: true,
      artists: sr?.artist as NavidromeArtist[] | undefined,
      albums: sr?.album as NavidromeAlbum[] | undefined,
      songs: sr?.song as NavidromeSong[] | undefined,
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown error' }
  }
}

export async function navidromeGetRandomSongs(
  server: NavidromeServerConfig,
  size = 20,
): Promise<{ ok: boolean; songs?: NavidromeSong[]; error?: string }> {
  return callSubsonicList<NavidromeSong>(server, 'getRandomSongs', 'randomSongs', 'song', { size: String(size) })
}

export async function navidromeStar(
  server: NavidromeServerConfig,
  opts: { id?: string; albumId?: string; artistId?: string },
): Promise<boolean> {
  try {
    const params: Record<string, string> = {}
    if (opts.id) params.id = opts.id
    if (opts.albumId) params.albumId = opts.albumId
    if (opts.artistId) params.artistId = opts.artistId
    const res = await fetch(buildApiUrl(server, 'star', params))
    return res.ok
  } catch { return false }
}

export async function navidromeUnstar(
  server: NavidromeServerConfig,
  opts: { id?: string; albumId?: string; artistId?: string },
): Promise<boolean> {
  try {
    const params: Record<string, string> = {}
    if (opts.id) params.id = opts.id
    if (opts.albumId) params.albumId = opts.albumId
    if (opts.artistId) params.artistId = opts.artistId
    const res = await fetch(buildApiUrl(server, 'unstar', params))
    return res.ok
  } catch { return false }
}

export async function navidromeGetLyricsBySongId(
  server: NavidromeServerConfig,
  songId: string,
): Promise<{ ok: boolean; lyrics?: import('@/types').NavidromeStructuredLyrics[]; error?: string }> {
  try {
    const url = buildApiUrl(server, 'getLyricsBySongId', { id: songId })
    const res = await fetch(url)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data = await res.json()
    const r = data['subsonic-response']
    if (r.status !== 'ok') return { ok: false, error: r.error?.message ?? 'failed' }
    const list = r.lyricsList
    return { ok: true, lyrics: list?.structuredLyrics as any }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown' }
  }
}

export async function navidromeGetArtist(
  server: NavidromeServerConfig,
  artistId: string,
): Promise<{ ok: boolean; artist?: NavidromeArtist; albums?: NavidromeAlbum[]; error?: string }> {
  try {
    const url = buildApiUrl(server, 'getArtist', { id: artistId })
    const res = await fetch(url)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data = await res.json()
    const r = data['subsonic-response']
    if (r.status !== 'ok') return { ok: false, error: r.error?.message ?? 'failed' }
    const artist = r.artist as any
    return { ok: true, artist, albums: artist?.album as NavidromeAlbum[] | undefined }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown' }
  }
}

export async function navidromeScrobble(
  server: NavidromeServerConfig,
  songId: string,
  submission = true,
): Promise<void> {
  try {
    await fetch(buildApiUrl(server, 'scrobble', { id: songId, submission: submission ? 'true' : 'false' }))
  } catch {}
}