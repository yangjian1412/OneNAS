import { create } from 'zustand'
import type { NavidromeStructuredLyrics } from '@/types'

export interface NavidromeLyricsData {
  songId: string
  structured: NavidromeStructuredLyrics[] | null
  plain: string | null
  loading: boolean
  error: string | null
}

interface NavidromeLyricsState {
  data: NavidromeLyricsData | null
  setData: (data: NavidromeLyricsData) => void
  clear: () => void
}

export const useNavidromeLyricsStore = create<NavidromeLyricsState>((set) => ({
  data: null,
  setData: (data) => set({ data }),
  clear: () => set({ data: null }),
}))