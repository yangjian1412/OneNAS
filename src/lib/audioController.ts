import { setAudioModeAsync, setIsAudioActiveAsync, AudioPlayer, createAudioPlayer } from 'expo-audio'
import { useNavidromePlayerStore } from '@/stores/navidromePlayerStore'
import type { NavidromeSong, NavidromeServerConfig } from '@/types'
import { navidromeGetStreamUrl, navidromeScrobble } from '@/lib/api/navidrome'

let player: AudioPlayer | null = null
let currentServer: NavidromeServerConfig | null = null
let scrobbled = false
let listenersBound = false
let initStarted = false
let initDone = false

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
          try {
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
            console.warn('[navidrome player] status error', e)
          }
        })
        listenersBound = true
      } catch (e) {
        console.warn('[navidrome player] bind listener failed', e)
      }
    }
    return player
  } catch (e) {
    console.warn('[navidrome player] create failed', e)
    return null
  }
}

function buildStreamSource(server: NavidromeServerConfig, song: NavidromeSong) {
  const url = navidromeGetStreamUrl(server, song.id)
  const headers: Record<string, string> = {}
  if (server.username) headers.u = server.username
  if (server.authToken && server.salt) {
    headers.t = server.authToken
    headers.s = server.salt
  } else if (server.password) {
    headers.p = server.password
  }
  headers.v = '1.16.1'
  headers.c = 'One NAS'
  return { uri: url, headers }
}

function safeUpdateLockScreen(server: NavidromeServerConfig | null, song: NavidromeSong | undefined) {
  if (!player || !song) return
  try {
    if (server) {
      const artworkUrl = song.coverArt ? navidromeGetStreamUrl(server, song.coverArt) : undefined
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
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
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

export function getServer(): NavidromeServerConfig | null {
  return currentServer
}

function safeReplace(src: any) {
  if (!player) return
  try {
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
  if (!newSong) return
  if (!currentServer) {
    console.warn('[navidrome player] no server')
    return
  }
  const p = ensurePlayer()
  if (!p) return
  scrobbled = false
  safeReplace(buildStreamSource(currentServer, newSong))
  if (useNavidromePlayerStore.getState().isPlaying) safePlay()
  safeUpdateLockScreen(currentServer, newSong)
}

export function playList(songs: NavidromeSong[], startIndex = 0) {
  const store = useNavidromePlayerStore.getState()
  store.playList(songs, startIndex)
  const newSong = useNavidromePlayerStore.getState().queue[useNavidromePlayerStore.getState().currentIndex]
  if (!newSong) return
  if (!currentServer) {
    console.warn('[navidrome player] no server')
    return
  }
  const p = ensurePlayer()
  if (!p) return
  scrobbled = false
  safeReplace(buildStreamSource(currentServer, newSong))
  safePlay()
  safeUpdateLockScreen(currentServer, newSong)
}

export function playAt(index: number) {
  const store = useNavidromePlayerStore.getState()
  store.playAt(index)
  const newSong = useNavidromePlayerStore.getState().queue[useNavidromePlayerStore.getState().currentIndex]
  if (!newSong) return
  if (!currentServer) return
  const p = ensurePlayer()
  if (!p) return
  scrobbled = false
  safeReplace(buildStreamSource(currentServer, newSong))
  if (useNavidromePlayerStore.getState().isPlaying) safePlay()
  safeUpdateLockScreen(currentServer, newSong)
}

export function next() {
  const store = useNavidromePlayerStore.getState()
  const prevIndex = store.currentIndex
  store.next()
  const newIndex = useNavidromePlayerStore.getState().currentIndex
  const stillPlaying = useNavidromePlayerStore.getState().isPlaying
  if (newIndex === prevIndex && !stillPlaying) return
  const newSong = useNavidromePlayerStore.getState().queue[newIndex]
  if (!newSong || !currentServer) return
  if (!player) return
  scrobbled = false
  safeReplace(buildStreamSource(currentServer, newSong))
  if (stillPlaying) safePlay()
  safeUpdateLockScreen(currentServer, newSong)
}

export function prev() {
  const store = useNavidromePlayerStore.getState()
  store.prev()
  const newSong = useNavidromePlayerStore.getState().queue[useNavidromePlayerStore.getState().currentIndex]
  if (!newSong || !currentServer) return
  if (!player) return
  scrobbled = false
  safeReplace(buildStreamSource(currentServer, newSong))
  if (useNavidromePlayerStore.getState().isPlaying) safePlay()
  safeUpdateLockScreen(currentServer, newSong)
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