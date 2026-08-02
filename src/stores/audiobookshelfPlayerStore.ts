import { create } from 'zustand'
import type {
  AudiobookshelfLibraryItem,
  AudiobookshelfPlaybackSession,
  AudiobookshelfServerConfig,
} from '@/types'

export interface AudiobookshelfPlayerControls {
  togglePlay: () => void
  stop: () => void
}

interface AudiobookshelfPlayerState {
  server: AudiobookshelfServerConfig | null
  currentItem: AudiobookshelfLibraryItem | null
  session: AudiobookshelfPlaybackSession | null
  currentTrackIdx: number
  currentTime: number
  duration: number
  playing: boolean
  coverUrl: string | null
  titleText: string
  authorText: string
  controls: AudiobookshelfPlayerControls | null

  setSnapshot: (data: Partial<Omit<AudiobookshelfPlayerState, 'setSnapshot' | 'setControls' | 'clear' | 'controls'>>) => void
  setControls: (c: AudiobookshelfPlayerControls | null) => void
  clear: () => void
}

const empty = {
  server: null as AudiobookshelfServerConfig | null,
  currentItem: null as AudiobookshelfLibraryItem | null,
  session: null as AudiobookshelfPlaybackSession | null,
  currentTrackIdx: 0,
  currentTime: 0,
  duration: 0,
  playing: false,
  coverUrl: null as string | null,
  titleText: '',
  authorText: '',
  controls: null as AudiobookshelfPlayerControls | null,
}

export const useAudiobookshelfPlayerStore = create<AudiobookshelfPlayerState>((set) => ({
  ...empty,
  setSnapshot: (data) => set((s) => ({ ...s, ...data })),
  setControls: (controls) => set({ controls }),
  clear: () => set({ ...empty }),
}))
