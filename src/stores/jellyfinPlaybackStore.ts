import { create } from 'zustand'
import { loadItem, saveItem } from '@/lib/storage'

const PREFS_KEY = 'jellyfin:playbackPrefs'

export interface JellyfinPlaybackPrefs {
  maxBitrate: number
  defaultAudioLang: string
  defaultSubtitleLang: string
  defaultPlaybackSpeed: number
  skipBackMs: number
  skipForwardMs: number
  doubleTapBackMs: number
  doubleTapForwardMs: number
  resumeLastPosition: boolean
  autoPlayNextEpisode: boolean
  markPlayedThresholdPct: number
  resetPositionThresholdPct: number
  landscapeByDefault: boolean
  useExternalPlayer: boolean
}

export const DEFAULT_PLAYBACK_PREFS: JellyfinPlaybackPrefs = {
  maxBitrate: 0,
  defaultAudioLang: '',
  defaultSubtitleLang: 'chi',
  defaultPlaybackSpeed: 1.0,
  skipBackMs: 10000,
  skipForwardMs: 30000,
  doubleTapBackMs: 10000,
  doubleTapForwardMs: 10000,
  resumeLastPosition: true,
  autoPlayNextEpisode: true,
  markPlayedThresholdPct: 90,
  resetPositionThresholdPct: 10,
  landscapeByDefault: false,
  useExternalPlayer: false,
}

interface PrefsState extends JellyfinPlaybackPrefs {
  loaded: boolean
  setMaxBitrate: (v: number) => void
  setDefaultAudioLang: (v: string) => void
  setDefaultSubtitleLang: (v: string) => void
  setDefaultPlaybackSpeed: (v: number) => void
  setSkipBackMs: (v: number) => void
  setSkipForwardMs: (v: number) => void
  setDoubleTapBackMs: (v: number) => void
  setDoubleTapForwardMs: (v: number) => void
  setResumeLastPosition: (v: boolean) => void
  setAutoPlayNextEpisode: (v: boolean) => void
  setMarkPlayedThresholdPct: (v: number) => void
  setResetPositionThresholdPct: (v: number) => void
  setLandscapeByDefault: (v: boolean) => void
  setUseExternalPlayer: (v: boolean) => void
  resetDefaults: () => Promise<void>
  loadFromStorage: () => Promise<void>
}

async function persistPrefs(prefs: JellyfinPlaybackPrefs): Promise<void> {
  await saveItem(PREFS_KEY, prefs)
}

export const useJellyfinPlaybackStore = create<PrefsState>((set, get) => ({
  ...DEFAULT_PLAYBACK_PREFS,
  loaded: false,

  setMaxBitrate: (v) => {
    set({ maxBitrate: v })
    void persistPrefs(extractPrefs(get()))
  },
  setDefaultAudioLang: (v) => {
    set({ defaultAudioLang: v })
    void persistPrefs(extractPrefs(get()))
  },
  setDefaultSubtitleLang: (v) => {
    set({ defaultSubtitleLang: v })
    void persistPrefs(extractPrefs(get()))
  },
  setDefaultPlaybackSpeed: (v) => {
    set({ defaultPlaybackSpeed: v })
    void persistPrefs(extractPrefs(get()))
  },
  setSkipBackMs: (v) => {
    set({ skipBackMs: v })
    void persistPrefs(extractPrefs(get()))
  },
  setSkipForwardMs: (v) => {
    set({ skipForwardMs: v })
    void persistPrefs(extractPrefs(get()))
  },
  setDoubleTapBackMs: (v) => {
    set({ doubleTapBackMs: v })
    void persistPrefs(extractPrefs(get()))
  },
  setDoubleTapForwardMs: (v) => {
    set({ doubleTapForwardMs: v })
    void persistPrefs(extractPrefs(get()))
  },
  setResumeLastPosition: (v) => {
    set({ resumeLastPosition: v })
    void persistPrefs(extractPrefs(get()))
  },
  setAutoPlayNextEpisode: (v) => {
    set({ autoPlayNextEpisode: v })
    void persistPrefs(extractPrefs(get()))
  },
  setMarkPlayedThresholdPct: (v) => {
    set({ markPlayedThresholdPct: v })
    void persistPrefs(extractPrefs(get()))
  },
  setResetPositionThresholdPct: (v) => {
    set({ resetPositionThresholdPct: v })
    void persistPrefs(extractPrefs(get()))
  },
  setLandscapeByDefault: (v) => {
    set({ landscapeByDefault: v })
    void persistPrefs(extractPrefs(get()))
  },
  setUseExternalPlayer: (v) => {
    set({ useExternalPlayer: v })
    void persistPrefs(extractPrefs(get()))
  },
  resetDefaults: async () => {
    set({ ...DEFAULT_PLAYBACK_PREFS })
    await persistPrefs(DEFAULT_PLAYBACK_PREFS)
  },
  loadFromStorage: async () => {
    const stored = await loadItem<Partial<JellyfinPlaybackPrefs>>(PREFS_KEY)
    if (stored) {
      set({ ...DEFAULT_PLAYBACK_PREFS, ...stored, loaded: true })
    } else {
      set({ loaded: true })
    }
  },
}))

function extractPrefs(s: PrefsState): JellyfinPlaybackPrefs {
  return {
    maxBitrate: s.maxBitrate,
    defaultAudioLang: s.defaultAudioLang,
    defaultSubtitleLang: s.defaultSubtitleLang,
    defaultPlaybackSpeed: s.defaultPlaybackSpeed,
    skipBackMs: s.skipBackMs,
    skipForwardMs: s.skipForwardMs,
    doubleTapBackMs: s.doubleTapBackMs,
    doubleTapForwardMs: s.doubleTapForwardMs,
    resumeLastPosition: s.resumeLastPosition,
    autoPlayNextEpisode: s.autoPlayNextEpisode,
    markPlayedThresholdPct: s.markPlayedThresholdPct,
    resetPositionThresholdPct: s.resetPositionThresholdPct,
    landscapeByDefault: s.landscapeByDefault,
    useExternalPlayer: s.useExternalPlayer,
  }
}