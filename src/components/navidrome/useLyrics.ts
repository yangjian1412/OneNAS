import { useNavidromeLyricsStore, type NavidromeLyricsData } from '@/stores/navidromeLyricsStore'

export type LyricsData = NavidromeLyricsData

export function useLyrics(_server: unknown, song: { id: string } | null): LyricsData {
  const data = useNavidromeLyricsStore((s) => s.data)
  if (!song) return { songId: '', structured: null, plain: null, loading: false, error: null }
  if (!data || data.songId !== song.id) {
    return { songId: song.id, structured: null, plain: null, loading: false, error: null }
  }
  return data
}

export function findCurrentLine(lines: { start: number }[], timeSec: number, offsetMs = 0): number {
  if (!lines.length) return -1
  const t = (timeSec * 1000) - offsetMs
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].start <= t) return i
  }
  return -1
}