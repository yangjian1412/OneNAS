import { apiFetch } from './client'
import type {
  JellyfinServerConfig,
  JellyfinMediaStream,
  JellyfinMediaSource,
  JellyfinPlaybackInfo,
  PlaybackProgressPayload,
  PlaybackStartInfo,
  PlaybackReportMethod,
} from '@/types'

const EMBY_AUTH = 'MediaBrowser Client="One NAS", Device="Android", DeviceId="one-nas-android", Version="1.0.0"'

function pbFetch<T>(
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

export function generatePlaySessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function buildProgressBody(p: PlaybackProgressPayload): Record<string, unknown> {
  return {
    ItemId: p.ItemId,
    PositionTicks: p.PositionTicks,
    CanSeek: p.CanSeek ?? true,
    IsPaused: p.IsPaused,
    IsMuted: p.IsMuted ?? false,
    Volume: p.Volume,
    PlayMethod: p.PlayMethod ?? 'DirectPlay',
    RepeatMode: p.RepeatMode ?? 'RepeatNone',
    PlaybackOrder: p.PlaybackOrder ?? 'Default',
    MediaSourceId: p.MediaSourceId,
    PlaySessionId: p.PlaySessionId,
    AudioStreamIndex: p.AudioStreamIndex,
    SubtitleStreamIndex: p.SubtitleStreamIndex,
  }
}

export async function reportPlaybackStart(
  server: JellyfinServerConfig,
  info: PlaybackStartInfo,
  playSessionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const body = {
    ItemId: info.ItemId,
    CanSeek: info.CanSeek ?? true,
    IsPaused: info.IsPaused ?? false,
    IsMuted: info.IsMuted ?? false,
    PlayMethod: info.PlayMethod ?? 'DirectPlay',
    MediaSourceId: info.MediaSourceId,
    AudioStreamIndex: info.AudioStreamIndex,
    SubtitleStreamIndex: info.SubtitleStreamIndex,
    MaxBitrate: info.MaxBitrate,
    StartPositionTicks: info.StartPositionTicks,
    PlaySessionId: playSessionId,
  }
  const r = await pbFetch(server, '/Sessions/Playing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { ok: r.ok, error: r.error }
}

export async function reportPlaybackProgress(
  server: JellyfinServerConfig,
  payload: PlaybackProgressPayload,
): Promise<{ ok: boolean; error?: string }> {
  const r = await pbFetch(server, '/Sessions/Playing/Progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildProgressBody(payload)),
  })
  return { ok: r.ok, error: r.error }
}

export async function reportPlaybackPing(
  server: JellyfinServerConfig,
  payload: PlaybackProgressPayload,
): Promise<{ ok: boolean; error?: string }> {
  const r = await pbFetch(server, '/Sessions/Playing/Ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildProgressBody(payload)),
  })
  return { ok: r.ok, error: r.error }
}

export async function reportPlaybackStop(
  server: JellyfinServerConfig,
  payload: PlaybackProgressPayload,
): Promise<{ ok: boolean; error?: string }> {
  const r = await pbFetch(server, '/Sessions/Playing/Stopped', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildProgressBody(payload)),
  })
  return { ok: r.ok, error: r.error }
}

export async function markPlayed(
  server: JellyfinServerConfig,
  itemId: string,
  played: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!server.userId) return { ok: false, error: 'Missing user id' }
  const path = played
    ? `/Users/${server.userId}/PlayedItems/${itemId}`
    : `/Users/${server.userId}/PlayedItems/${itemId}`
  const r = await pbFetch(server, path, {
    method: played ? 'POST' : 'DELETE',
  })
  return { ok: r.ok, error: r.error }
}

export interface StreamOptions {
  maxBitrate?: number
  audioStreamIndex?: number
  subtitleStreamIndex?: number
  startPositionTicks?: number
  mediaSourceId?: string
  playMethod?: PlaybackReportMethod
}

export interface JellyfinStreamResult {
  ok: boolean
  url?: string
  sessionId?: string
  source?: JellyfinMediaSource
  audioStreams: JellyfinMediaStream[]
  subtitleStreams: JellyfinMediaStream[]
  videoStream?: JellyfinMediaStream
  defaultAudioIndex?: number
  defaultSubtitleIndex?: number
  error?: string
}

export async function jellyfinGetStream(
  server: JellyfinServerConfig,
  itemId: string,
  options: StreamOptions = {},
): Promise<JellyfinStreamResult> {
  if (!itemId) return { ok: false, audioStreams: [], subtitleStreams: [], error: 'Invalid item ID' }
  if (!server.userId) return { ok: false, audioStreams: [], subtitleStreams: [], error: 'Missing user id' }

  const body: Record<string, unknown> = {
    UserId: server.userId,
    StartTimeTicks: 0,
    IsPlayback: false,
    AutoOpenLiveStream: false,
    EnableDirectPlay: true,
    EnableDirectStream: true,
    EnableTranscoding: true,
  }
  if (options.maxBitrate != null && options.maxBitrate > 0) body.MaxStreamingBitrate = options.maxBitrate
  if (options.audioStreamIndex != null) body.AudioStreamIndex = options.audioStreamIndex
  if (options.subtitleStreamIndex != null) body.SubtitleStreamIndex = options.subtitleStreamIndex
  if (options.startPositionTicks != null) body.StartPositionTicks = options.startPositionTicks
  if (options.mediaSourceId) body.MediaSourceId = options.mediaSourceId

  const r = await pbFetch<JellyfinPlaybackInfo>(server, `/Items/${itemId}/PlaybackInfo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!r.ok || !r.data) {
    return { ok: false, audioStreams: [], subtitleStreams: [], error: r.error || 'Playback info request failed' }
  }

  const sources = r.data.MediaSources ?? []
  if (sources.length === 0) {
    return { ok: false, audioStreams: [], subtitleStreams: [], error: 'No playable media source' }
  }

  const source = sources[0]
  const audioStreams = (source.MediaStreams ?? []).filter((s) => s.Type === 'Audio')
  const subtitleStreams = (source.MediaStreams ?? []).filter((s) => s.Type === 'Subtitle')
  const videoStream = (source.MediaStreams ?? []).find((s) => s.Type === 'Video')

  const defaultAudioIndex = audioStreams.find((s) => s.IsDefault)?.Index
  const defaultSubtitleIndex = subtitleStreams.find((s) => s.IsDefault)?.Index

  let url: string
  if (source.DirectStreamUrl) {
    url = source.DirectStreamUrl.includes('?')
      ? `${source.DirectStreamUrl}&api_key=${server.accessToken}`
      : `${source.DirectStreamUrl}?api_key=${server.accessToken}`
  } else {
    url = `${server.url}/Videos/${itemId}/stream.mp4?api_key=${server.accessToken}&Static=true`
  }

  return {
    ok: true,
    url,
    sessionId: r.data.PlaySessionId,
    source,
    audioStreams,
    subtitleStreams,
    videoStream,
    defaultAudioIndex,
    defaultSubtitleIndex,
  }
}

export function ticksToMs(ticks: number): number {
  return Math.round(ticks / 10000)
}

export function msToTicks(ms: number): number {
  return Math.round(ms * 10000)
}

export function msToTimecode(ms: number): string {
  if (!isFinite(ms) || ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}