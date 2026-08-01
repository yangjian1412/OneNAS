import { NativeModules, NativeEventEmitter } from 'react-native'
import type { NavidromeSong, NavidromeServerConfig, NavidromeStructuredLyrics, NavidromeLyricsLine } from '@/types'
import { navidromeGetLyricsBySongId } from '@/lib/api/navidrome'
import { useNavidromePlayerStore } from '@/stores/navidromePlayerStore'
import { useNavidromePlaybackStore } from '@/stores/navidromePlaybackStore'
import { useNavidromeLyricsStore } from '@/stores/navidromeLyricsStore'
import { navidromeGetCoverArtUrl } from '@/lib/api/navidrome'
import { getPlayer } from '@/lib/audioController'

const { NavidromeLyricsModule } = NativeModules as {
  NavidromeLyricsModule?: {
    showDesktopLyrics: (prev: string, current: string, next1: string, next2: string, config: object) => void
    updateDesktopLyrics: (prev: string, current: string, next1: string, next2: string) => void
    hideDesktopLyrics: () => void
    showLyricsNotification: (prev: string, current: string, next1: string, next2: string, title: string, artist: string) => void
    cancelLyricsNotification: () => void
  }
}

interface LinesState {
  prev: string
  current: string
  next1: string
  next2: string
  currentIdx: number
}

let started = false
let unsubPlayer: (() => void) | null = null
let unsubPrefs: (() => void) | null = null
let positionSub: { remove: () => void } | null = null
let lastInjectedLine: { songId: string | null; line: string | null; at: number } = { songId: null, line: null, at: 0 }
let lastDesktopState: { songId: string | null; lines: LinesState | null } = { songId: null, lines: null }
let lastNotifState: { songId: string | null; lines: LinesState | null; playing: boolean | null } = {
  songId: null,
  lines: null,
  playing: null,
}
let originalMetaCache: { songId: string | null; meta: { title: string; artist: string; albumTitle: string; artworkUrl?: string } } = {
  songId: null,
  meta: { title: '', artist: '', albumTitle: '' },
}
const SYSTEM_INJECT_MIN_INTERVAL_MS = 1500

function getServer(): NavidromeServerConfig | null {
  // Mirror audioController's getServer via a soft import to avoid cycles
  const mod = require('@/lib/audioController') as { getServer?: () => NavidromeServerConfig | null }
  return mod.getServer ? mod.getServer() : null
}

async function ensureLyricsFetched(songId: string) {
  const server = getServer()
  const cur = useNavidromeLyricsStore.getState().data
  if (cur && cur.songId === songId) return cur
  if (!server) return null
  useNavidromeLyricsStore.getState().setData({
    songId,
    structured: null,
    plain: null,
    loading: true,
    error: null,
  })
  const r = await navidromeGetLyricsBySongId(server, songId)
  if (!r.ok) {
    useNavidromeLyricsStore.getState().setData({
      songId,
      structured: null,
      plain: null,
      loading: false,
      error: r.error ?? '加载失败',
    })
    return null
  }
  const structured = (r.lyrics ?? []).filter((s) => s && Array.isArray(s.line)) as NavidromeStructuredLyrics[]
  useNavidromeLyricsStore.getState().setData({
    songId,
    structured: structured.length ? structured : null,
    plain: r.plain ?? null,
    loading: false,
    error: null,
  })
  return useNavidromeLyricsStore.getState().data
}

function computeLines(structured: NavidromeStructuredLyrics[] | null, currentTimeSec: number): LinesState {
  if (!structured || structured.length === 0) return { prev: '', current: '', next1: '', next2: '', currentIdx: -1 }
  const active = structured[0]
  const lines: NavidromeLyricsLine[] = active?.line ?? []
  if (!lines.length) return { prev: '', current: '', next1: '', next2: '', currentIdx: -1 }
  const offsetMs = active.offset ?? 0
  const tMs = currentTimeSec * 1000 - offsetMs
  let idx = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].start <= tMs) { idx = i; break }
  }
  const prev = idx > 0 ? (lines[idx - 1].value ?? '').trim() : ''
  const current = idx >= 0 ? (lines[idx].value ?? '').trim() : ''
  const next1 = idx + 1 < lines.length ? (lines[idx + 1].value ?? '').trim() : ''
  const next2 = idx + 2 < lines.length ? (lines[idx + 2].value ?? '').trim() : ''
  return { prev, current, next1, next2, currentIdx: idx }
}

function desktopConfigMap() {
  const p = useNavidromePlaybackStore.getState()
  return {
    rgb: p.lyricColor,
    bgAlpha: Math.round(p.lyricOpacity * 100),
    textAlpha: Math.round(p.lyricOpacity * 100),
    alignment: p.lyricAlignment === 'left' ? 0 : p.lyricAlignment === 'right' ? 2 : p.lyricAlignment === 'split' ? 3 : 1,
    positionY: p.lyricDesktopPositionY,
    swapOrder: p.lyricDesktopSwapOrder,
  }
}

function pushDesktop(lines: LinesState, songId: string) {
  if (!NavidromeLyricsModule) return
  const cfg = desktopConfigMap()
  // Always re-send config so color/opacity/alignment/fontSize changes apply live
  NavidromeLyricsModule.showDesktopLyrics(lines.prev, lines.current, lines.next1, lines.next2, cfg)
  lastDesktopState = { songId, lines }
}

function pushNotification(lines: LinesState, song: NavidromeSong, playing: boolean) {
  if (!NavidromeLyricsModule) return
  if (!playing) {
    NavidromeLyricsModule.cancelLyricsNotification()
    lastNotifState = { songId: song.id, lines: null, playing: false }
    return
  }
  const title = song.title ?? 'Navidrome'
  const artist = song.artist ?? ''
  const same =
    lastNotifState.songId === song.id &&
    lastNotifState.playing === true &&
    lastNotifState.lines &&
    lastNotifState.lines.current === lines.current &&
    lastNotifState.lines.prev === lines.prev &&
    lastNotifState.lines.next1 === lines.next1 &&
    lastNotifState.lines.next2 === lines.next2
  if (!same) {
    NavidromeLyricsModule.showLyricsNotification(
      lines.prev,
      lines.current,
      lines.next1,
      lines.next2,
      title,
      artist,
    )
  }
  lastNotifState = { songId: song.id, lines, playing: true }
}

function restoreSystemMeta(force = false) {
  const player = getPlayer()
  if (!player) return
  const o = originalMetaCache
  if (!force && !lastInjectedLine.line) return
  try {
    player.updateLockScreenMetadata(o.meta)
  } catch {}
  lastInjectedLine = { songId: o.songId, line: null, at: 0 }
}

function pushSystemPlayer(lines: LinesState, song: NavidromeSong, server: NavidromeServerConfig | null) {
  const player = getPlayer()
  if (!player) return
  // Build original metadata once per song
  if (originalMetaCache.songId !== song.id) {
    const oArtist = song.artist ?? ''
    const oTitle = song.title ?? ''
    const oAlbum = song.album ?? ''
    const artworkUrl = song.coverArt && server ? navidromeGetCoverArtUrl(server, song.coverArt) : undefined
    originalMetaCache = {
      songId: song.id,
      meta: { title: oTitle, artist: oArtist, albumTitle: oAlbum, artworkUrl },
    }
    // Force re-inject: original meta may have been clobbered by an earlier inject
    lastInjectedLine = { songId: null, line: null, at: 0 }
  }
  if (!lines.current) {
    // no lyric line yet — keep original
    restoreSystemMeta()
    return
  }
  // Skip if song + line unchanged and we're within throttle window
  const now = Date.now()
  if (
    lastInjectedLine.songId === song.id &&
    lastInjectedLine.line === lines.current &&
    now - lastInjectedLine.at < SYSTEM_INJECT_MIN_INTERVAL_MS
  ) return
  // If line unchanged and we're outside throttle but already at correct state, just update timestamp
  if (lastInjectedLine.songId === song.id && lastInjectedLine.line === lines.current) {
    lastInjectedLine = { songId: song.id, line: lines.current, at: now }
    return
  }
  const o = originalMetaCache.meta
  const composedArtist = o.artist && o.title ? `${o.artist} - ${o.title}` : o.artist || o.title
  try {
    player.updateLockScreenMetadata({
      title: lines.current,
      artist: composedArtist,
      albumTitle: o.albumTitle,
      artworkUrl: o.artworkUrl,
    })
    lastInjectedLine = { songId: song.id, line: lines.current, at: now }
  } catch (e) {
    console.warn('[lyrics] updateLockScreenMetadata failed', e)
  }
}

async function tick() {
  const player = useNavidromePlayerStore.getState()
  const prefs = useNavidromePlaybackStore.getState()
  const song = player.queue[player.currentIndex]
  if (!song) {
    if (NavidromeLyricsModule) {
      NavidromeLyricsModule.hideDesktopLyrics()
      NavidromeLyricsModule.cancelLyricsNotification()
    }
    lastDesktopState = { songId: null, lines: null }
    lastNotifState = { songId: null, lines: null, playing: null }
    restoreSystemMeta()
    return
  }

  await ensureLyricsFetched(song.id)
  const lyricsData = useNavidromeLyricsStore.getState().data
  const lines = computeLines(lyricsData?.structured ?? null, player.currentTime)

  const wantDesktop = prefs.lyricDesktop
  const wantNotif = prefs.lyricNotification
  const wantSystem = prefs.lyricInjectSystem
  const playing = !!player.isPlaying

  if (wantDesktop) {
    pushDesktop(lines, song.id)
  } else if (lastDesktopState.songId) {
    NavidromeLyricsModule?.hideDesktopLyrics()
    lastDesktopState = { songId: null, lines: null }
  }

  if (wantNotif) {
    pushNotification(lines, song, playing)
  } else if (lastNotifState.songId) {
    NavidromeLyricsModule?.cancelLyricsNotification()
    lastNotifState = { songId: null, lines: null, playing: null }
  }

  if (wantSystem) {
    pushSystemPlayer(lines, song, getServer())
  } else if (lastInjectedLine.songId) {
    restoreSystemMeta()
  }
}

// Compute the current line index without triggering lyrics fetch; used for change detection
function currentLineKey(): string {
  const player = useNavidromePlayerStore.getState()
  const data = useNavidromeLyricsStore.getState().data
  const song = player.queue[player.currentIndex]
  if (!song || !data || data.songId !== song.id) return `${player.currentIndex}|${player.isPlaying ? 1 : 0}`
  const structured = data.structured
  if (!structured || structured.length === 0) return `${song.id}|${player.isPlaying ? 1 : 0}`
  const active = structured[0]
  const lines = active?.line ?? []
  const offsetMs = active?.offset ?? 0
  const tMs = player.currentTime * 1000 - offsetMs
  let idx = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].start <= tMs) { idx = i; break }
  }
  return `${song.id}|${idx}|${player.isPlaying ? 1 : 0}`
}

export function startLyricsDisplay() {
  if (started) return
  started = true

  // Listen to player store changes — only fire when the current line key actually changes
  let lastKey = currentLineKey()
  unsubPlayer = useNavidromePlayerStore.subscribe((state, prev) => {
    if (
      state.currentIndex !== prev.currentIndex ||
      state.isPlaying !== prev.isPlaying ||
      state.queue !== prev.queue
    ) {
      lastKey = currentLineKey()
      tick().catch(() => {})
      return
    }
    if (state.currentTime !== prev.currentTime) {
      const key = currentLineKey()
      if (key !== lastKey) {
        lastKey = key
        tick().catch(() => {})
      }
    }
  })

  // Listen to prefs changes
  unsubPrefs = useNavidromePlaybackStore.subscribe((state, prev) => {
    if (
      state.lyricNotification !== prev.lyricNotification ||
      state.lyricDesktop !== prev.lyricDesktop ||
      state.lyricInjectSystem !== prev.lyricInjectSystem ||
      state.lyricColor !== prev.lyricColor ||
      state.lyricOpacity !== prev.lyricOpacity ||
      state.lyricAlignment !== prev.lyricAlignment ||
      state.lyricDesktopPositionY !== prev.lyricDesktopPositionY ||
      state.lyricDesktopSwapOrder !== prev.lyricDesktopSwapOrder
    ) {
      tick().catch(() => {})
    }
  })

  // Listen to position drag events from native
  if (NavidromeLyricsModule) {
    try {
      const emitter = new NativeEventEmitter(NavidromeLyricsModule as unknown as { addListener: () => void; removeListeners: () => void })
      positionSub = emitter.addListener('NavidromeLyrics/positionChanged', (yFromBottom: number) => {
        useNavidromePlaybackStore.getState().setLyricDesktopPositionY(yFromBottom)
      })
    } catch {}
  }

  // initial tick
  tick().catch(() => {})
}

export function stopLyricsDisplay() {
  if (!started) return
  started = false
  unsubPlayer?.()
  unsubPlayer = null
  unsubPrefs?.()
  unsubPrefs = null
  positionSub?.remove()
  positionSub = null
  NavidromeLyricsModule?.hideDesktopLyrics()
  NavidromeLyricsModule?.cancelLyricsNotification()
  restoreSystemMeta(true)
  lastDesktopState = { songId: null, lines: null }
  lastNotifState = { songId: null, lines: null, playing: null }
  useNavidromeLyricsStore.getState().clear()
}

// Belt-and-braces: re-apply correct metadata when player re-binds a new song
export function onLockScreenMetaReset(songId: string | null) {
  if (songId !== originalMetaCache.songId) {
    lastInjectedLine = { songId: null, line: null, at: 0 }
  }
}

// Re-export for callers that need to ensure metadata restore on logout etc.
export { restoreSystemMeta, originalMetaCache }