import { setAudioModeAsync, setIsAudioActiveAsync, AudioPlayer, createAudioPlayer } from 'expo-audio'
import { PermissionsAndroid, Platform } from 'react-native'
import { useNavidromePlayerStore } from '@/stores/navidromePlayerStore'
import { useNavidromeStore } from '@/stores/navidromeStore'
import type { NavidromeSong, NavidromeServerConfig } from '@/types'
import { navidromeGetStreamUrl, navidromeGetCoverArtUrl, navidromeScrobble } from '@/lib/api/navidrome'

let player: AudioPlayer | null = null
let currentServer: NavidromeServerConfig | null = null
let scrobbled = false
let listenersBound = false
let initStarted = false
let initDone = false
let statusTimer: ReturnType<typeof setInterval> | null = null

function redactUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.searchParams.has('p')) u.searchParams.set('p', '***')
    return u.toString()
  } catch {
    return url
  }
}

function applyStatus(status: any) {
  try {
    if (status?.error) {
      console.warn('[np] playback error', status.error)
      const storeErr = useNavidromePlayerStore.getState()
      storeErr.setPlaybackError(String(status.error))
    }
    const store = useNavidromePlayerStore.getState()
    if (!store.isScrubbing && typeof status.currentTime === 'number') {
      store.setCurrentTime(status.currentTime)
    }
    if (typeof status.duration === 'number' && status.duration > 0) {
      store.setDuration(status.duration)
    }
    if (typeof status.isLoaded === 'boolean') {
      store.setIsReady(status.isLoaded)
    }
    if (status.playing && !scrobbled) {
      scrobbled = true
      const s = useNavidromePlayerStore.getState().queue[useNavidromePlayerStore.getState().currentIndex]
      if (s && currentServer) {
        navidromeScrobble(currentServer, s.id, true).catch(() => {})
      }
    }
    if (status.didJustFinish && (status.currentTime ?? 0) > 1) {
      scrobbled = false
      next()
    }
  } catch (e) {
    console.warn('[np] status error', e)
  }
}

function startPoller() {
  if (!player || statusTimer) return
  statusTimer = setInterval(() => {
    try {
      const st = player!.currentStatus
      if (st) {
        applyStatus(st)
      }
    } catch (e) {
      console.warn('[np] poll error', e)
    }
  }, 500)
}

function stopPoller() {
  if (statusTimer) {
    clearInterval(statusTimer)
    statusTimer = null
  }
}

function ensurePlayer(): AudioPlayer | null {
  if (player) return player
  try {
    player = createAudioPlayer(null, {
      updateInterval: 250,
      keepAudioSessionActive: true,
    })
    if (player && !listenersBound) {
      try {
        player.addListener('playbackStatusUpdate', (status: any) => {
          applyStatus(status)
        })
        listenersBound = true
      } catch (e) {
        console.warn('[navidrome player] bind listener failed', e)
      }
    }
    startPoller()
    return player
  } catch (e) {
    console.warn('[navidrome player] create failed', e)
    return null
  }
}

function buildStreamSource(server: NavidromeServerConfig, song: NavidromeSong): string {
  return navidromeGetStreamUrl(server, song.id)
}

function safeUpdateLockScreen(server: NavidromeServerConfig | null, song: NavidromeSong | undefined) {
  if (!player || !song) return
  try {
    if (server) {
      const artworkUrl = song.coverArt ? navidromeGetCoverArtUrl(server, song.coverArt) : undefined
      player.setActiveForLockScreen(true, {
        title: song.title ?? '',
        artist: song.artist ?? '',
        albumTitle: song.album ?? '',
        artworkUrl,
      })
    } else {
      try { player.clearLockScreenControls() } catch {}
    }
  } catch {}
}

export async function initAudio() {
  if (initStarted) return
  initStarted = true
  try {
    if (Platform.OS === 'android' && (Platform.Version as number) >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
    }
  } catch (e) {
    console.warn('[navidrome player] notification permission request failed', e)
  }
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      shouldPlayInBackground: true,
    })
  } catch (e) {
    console.warn('[navidrome player] setAudioModeAsync failed', e)
  }
  try {
    await setIsAudioActiveAsync(true)
  } catch (e) {
    console.warn('[navidrome player] setIsAudioActiveAsync failed', e)
  }
  try {
    ensurePlayer()
  } catch (e) {
    console.warn('[navidrome player] ensurePlayer failed', e)
  }
  initDone = true
}

export function isAudioInitialized(): boolean {
  return initDone
}

export function setServer(server: NavidromeServerConfig | null) {
  currentServer = server
}

function resolveServer(): NavidromeServerConfig | null {
  if (currentServer) return currentServer
  const fallback = useNavidromeStore.getState().server
  if (fallback) {
    currentServer = fallback
    console.log('[np] resolved server from store', fallback.url)
  }
  return currentServer
}

export function getServer(): NavidromeServerConfig | null {
  return currentServer
}

function safeReplace(src: any) {
  if (!player) return
  try {
    const url = typeof src === 'string' ? src : src?.uri
    console.log('[np] replace', redactUrl(String(url)))
    player.replace(src)
  } catch (e) {
    console.warn('[navidrome player] replace failed', e)
  }
}

function safePlay() {
  if (!player) return
  try {
    player.play()
  } catch (e) {
    console.warn('[navidrome player] play failed', e)
  }
}

function safePause() {
  if (!player) return
  try {
    player.pause()
  } catch (e) {
    console.warn('[navidrome player] pause failed', e)
  }
}

function safeSeek(sec: number) {
  if (!player) return
  try {
    player.seekTo(sec)
  } catch (e) {
    console.warn('[navidrome player] seekTo failed', e)
  }
}

export function playSong(song: NavidromeSong, queue?: NavidromeSong[]) {
  const store = useNavidromePlayerStore.getState()
  store.playSong(song, queue)
  const newSong = useNavidromePlayerStore.getState().queue[useNavidromePlayerStore.getState().currentIndex]
  const server = resolveServer()
  if (!newSong || !server) {
    console.warn('[navidrome player] no server')
    return
  }
  const p = ensurePlayer()
  if (!p) return
  scrobbled = false
  safeReplace(buildStreamSource(server, newSong))
  if (useNavidromePlayerStore.getState().isPlaying) safePlay()
  safeUpdateLockScreen(server, newSong)
}

export function playList(songs: NavidromeSong[], startIndex = 0) {
  const store = useNavidromePlayerStore.getState()
  store.playList(songs, startIndex)
  const newSong = useNavidromePlayerStore.getState().queue[useNavidromePlayerStore.getState().currentIndex]
  const server = resolveServer()
  if (!newSong || !server) {
    console.warn('[navidrome player] no server')
    return
  }
  const p = ensurePlayer()
  if (!p) return
  scrobbled = false
  safeReplace(buildStreamSource(server, newSong))
  safePlay()
  safeUpdateLockScreen(server, newSong)
}

export function playAt(index: number) {
  const store = useNavidromePlayerStore.getState()
  store.playAt(index)
  const newSong = useNavidromePlayerStore.getState().queue[useNavidromePlayerStore.getState().currentIndex]
  const server = resolveServer()
  if (!newSong || !server) return
  const p = ensurePlayer()
  if (!p) return
  scrobbled = false
  safeReplace(buildStreamSource(server, newSong))
  if (useNavidromePlayerStore.getState().isPlaying) safePlay()
  safeUpdateLockScreen(server, newSong)
}

export function next() {
  const store = useNavidromePlayerStore.getState()
  const prevIndex = store.currentIndex
  store.next()
  const newIndex = useNavidromePlayerStore.getState().currentIndex
  const stillPlaying = useNavidromePlayerStore.getState().isPlaying
  if (newIndex === prevIndex && !stillPlaying) return
  const newSong = useNavidromePlayerStore.getState().queue[newIndex]
  const server = resolveServer()
  if (!newSong || !server) return
  if (!player) return
  scrobbled = false
  safeReplace(buildStreamSource(server, newSong))
  if (stillPlaying) safePlay()
  safeUpdateLockScreen(server, newSong)
}

export function prev() {
  const store = useNavidromePlayerStore.getState()
  store.prev()
  const newSong = useNavidromePlayerStore.getState().queue[useNavidromePlayerStore.getState().currentIndex]
  const server = resolveServer()
  if (!newSong || !server) return
  if (!player) return
  scrobbled = false
  safeReplace(buildStreamSource(server, newSong))
  if (useNavidromePlayerStore.getState().isPlaying) safePlay()
  safeUpdateLockScreen(server, newSong)
}

export function togglePlay() {
  const store = useNavidromePlayerStore.getState()
  const willPlay = !store.isPlaying
  store.setIsPlaying(willPlay)
  if (willPlay) safePlay()
  else safePause()
}

export function seekTo(seconds: number) {
  const store = useNavidromePlayerStore.getState()
  store.setCurrentTime(seconds)
  safeSeek(seconds)
}

export function setVolume(v: number) {
  if (!player) return
  try { player.volume = Math.max(0, Math.min(1, v)) } catch {}
}

export function clear() {
  try { safePause() } catch {}
  useNavidromePlayerStore.getState().clear()
}

export function getPlayer(): AudioPlayer | null {
  return player
}