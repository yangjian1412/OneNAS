import { create } from 'zustand'
import { loadItem, saveItem } from '@/lib/storage'

const PREFS_KEY = 'audiobookshelf:playbackPrefs'

export interface AudiobookshelfPlaybackPrefs {
  skipBackSec: number
  skipForwardSec: number
  defaultSpeed: number
  sleepMinutes: number
  sleepEnabled: boolean
}

export const DEFAULT_PLAYBACK_PREFS: AudiobookshelfPlaybackPrefs = {
  skipBackSec: 10,
  skipForwardSec: 10,
  defaultSpeed: 1,
  sleepMinutes: 0,
  sleepEnabled: false,
}

interface PrefsState extends AudiobookshelfPlaybackPrefs {
  loaded: boolean
  setSkipBackSec: (v: number) => void
  setSkipForwardSec: (v: number) => void
  setDefaultSpeed: (v: number) => void
  setSleepMinutes: (v: number) => void
  setSleepEnabled: (v: boolean) => void
  resetDefaults: () => Promise<void>
  loadFromStorage: () => Promise<void>
}

async function persistPrefs(prefs: AudiobookshelfPlaybackPrefs): Promise<void> {
  await saveItem(PREFS_KEY, prefs)
}

export const useAudiobookshelfPlaybackStore = create<PrefsState>((set, get) => ({
  ...DEFAULT_PLAYBACK_PREFS,
  loaded: false,

  setSkipBackSec: (v) => {
    set({ skipBackSec: v })
    void persistPrefs(extractPrefs(get()))
  },
  setSkipForwardSec: (v) => {
    set({ skipForwardSec: v })
    void persistPrefs(extractPrefs(get()))
  },
  setDefaultSpeed: (v) => {
    set({ defaultSpeed: v })
    void persistPrefs(extractPrefs(get()))
  },
  setSleepMinutes: (v) => {
    set({ sleepMinutes: v })
    void persistPrefs(extractPrefs(get()))
  },
  setSleepEnabled: (v) => {
    set({ sleepEnabled: v })
    void persistPrefs(extractPrefs(get()))
  },
  resetDefaults: async () => {
    set({ ...DEFAULT_PLAYBACK_PREFS })
    await persistPrefs(DEFAULT_PLAYBACK_PREFS)
  },
  loadFromStorage: async () => {
    const stored = await loadItem<Partial<AudiobookshelfPlaybackPrefs>>(PREFS_KEY)
    if (stored) {
      set({ ...DEFAULT_PLAYBACK_PREFS, ...stored, loaded: true })
    } else {
      set({ loaded: true })
    }
  },
}))

function extractPrefs(s: PrefsState): AudiobookshelfPlaybackPrefs {
  return {
    skipBackSec: s.skipBackSec,
    skipForwardSec: s.skipForwardSec,
    defaultSpeed: s.defaultSpeed,
    sleepMinutes: s.sleepMinutes,
    sleepEnabled: s.sleepEnabled,
  }
}
