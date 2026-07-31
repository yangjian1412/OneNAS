import { create } from 'zustand'
import type { NavidromeSong } from '@/types'

export type PlayMode = 'list' | 'list-repeat' | 'single-repeat' | 'shuffle'

interface NavidromePlayerState {
  queue: NavidromeSong[]
  currentIndex: number
  playMode: PlayMode
  isPlaying: boolean
  currentTime: number
  duration: number
  isReady: boolean
  isScrubbing: boolean

  playSong: (song: NavidromeSong, queue?: NavidromeSong[]) => void
  playList: (songs: NavidromeSong[], startIndex?: number) => void
  playAt: (index: number) => void
  next: () => void
  prev: () => void
  togglePlay: () => void
  setIsPlaying: (v: boolean) => void
  setCurrentTime: (s: number) => void
  setDuration: (s: number) => void
  setIsReady: (v: boolean) => void
  setIsScrubbing: (v: boolean) => void
  setPlayMode: (mode: PlayMode) => void
  cyclePlayMode: () => void
  removeFromQueue: (index: number) => void
  clear: () => void
}

export const useNavidromePlayerStore = create<NavidromePlayerState>((set, get) => ({
  queue: [],
  currentIndex: -1,
  playMode: 'list',
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  isReady: false,
  isScrubbing: false,

  playSong: (song, queue) => {
    if (queue && queue.length) {
      const idx = queue.findIndex((s) => s.id === song.id)
      set({
        queue,
        currentIndex: idx >= 0 ? idx : 0,
        isPlaying: true,
        currentTime: 0,
        duration: 0,
        isReady: false,
      })
    } else {
      const q = get().queue
      const idx = q.findIndex((s) => s.id === song.id)
      set({
        queue: idx >= 0 ? q : [song],
        currentIndex: idx >= 0 ? idx : 0,
        isPlaying: true,
        currentTime: 0,
        duration: 0,
        isReady: false,
      })
    }
  },

  playList: (songs, startIndex = 0) => {
    if (songs.length === 0) return
    set({
      queue: songs,
      currentIndex: Math.min(Math.max(0, startIndex), songs.length - 1),
      isPlaying: true,
      currentTime: 0,
      duration: 0,
      isReady: false,
    })
  },

  playAt: (index) => {
    const q = get().queue
    if (index < 0 || index >= q.length) return
    set({
      currentIndex: index,
      isPlaying: true,
      currentTime: 0,
      duration: 0,
      isReady: false,
    })
  },

  next: () => {
    const { queue, currentIndex, playMode } = get()
    if (queue.length === 0) return
    if (playMode === 'single-repeat') {
      set({ currentTime: 0, isReady: false })
      return
    }
    if (playMode === 'shuffle') {
      if (queue.length === 1) {
        set({ currentTime: 0, isReady: false })
        return
      }
      let nextIdx = currentIndex
      while (nextIdx === currentIndex) {
        nextIdx = Math.floor(Math.random() * queue.length)
      }
      set({ currentIndex: nextIdx, currentTime: 0, isReady: false })
      return
    }
    if (currentIndex < queue.length - 1) {
      set({ currentIndex: currentIndex + 1, currentTime: 0, isReady: false })
    } else if (playMode === 'list-repeat') {
      set({ currentIndex: 0, currentTime: 0, isReady: false })
    } else {
      set({ isPlaying: false, currentTime: get().duration })
    }
  },

  prev: () => {
    const { queue, currentIndex, currentTime } = get()
    if (queue.length === 0) return
    if (currentTime > 3) {
      set({ currentTime: 0 })
      return
    }
    if (currentIndex > 0) {
      set({ currentIndex: currentIndex - 1, currentTime: 0, isReady: false })
    } else if (get().playMode === 'list-repeat') {
      set({ currentIndex: queue.length - 1, currentTime: 0, isReady: false })
    } else {
      set({ currentTime: 0 })
    }
  },

  togglePlay: () => set({ isPlaying: !get().isPlaying }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setCurrentTime: (s) => set({ currentTime: s }),
  setDuration: (s) => set({ duration: s }),
  setIsReady: (v) => set({ isReady: v }),
  setIsScrubbing: (v) => set({ isScrubbing: v }),

  setPlayMode: (mode) => set({ playMode: mode }),
  cyclePlayMode: () => {
    const order: PlayMode[] = ['list', 'list-repeat', 'single-repeat', 'shuffle']
    const i = order.indexOf(get().playMode)
    set({ playMode: order[(i + 1) % order.length] })
  },

  removeFromQueue: (index) => {
    const { queue, currentIndex } = get()
    if (index < 0 || index >= queue.length) return
    if (index === currentIndex) return
    const q = [...queue]
    q.splice(index, 1)
    const ci = currentIndex > index ? currentIndex - 1 : currentIndex
    set({ queue: q, currentIndex: ci })
  },

  clear: () => set({
    queue: [],
    currentIndex: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isReady: false,
  }),
}))