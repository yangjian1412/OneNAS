import { useEffect, useState } from 'react'
import type { NavidromeSong, NavidromeServerConfig, NavidromeStructuredLyrics } from '@/types'
import { navidromeGetLyricsBySongId } from '@/lib/api/navidrome'

export interface LyricsData {
  structured: NavidromeStructuredLyrics[] | null
  plain: string | null
  loading: boolean
  error: string | null
}

export function useLyrics(server: NavidromeServerConfig | null, song: NavidromeSong | null): LyricsData {
  const [data, setData] = useState<LyricsData>({ structured: null, plain: null, loading: false, error: null })

  useEffect(() => {
    let cancelled = false
    if (!server || !song) {
      setData({ structured: null, plain: null, loading: false, error: null })
      return
    }
    setData((d) => ({ ...d, loading: true, error: null }))
    navidromeGetLyricsBySongId(server, song.id).then((r) => {
      if (cancelled) return
      if (r.ok) {
        const structured = (r.lyrics ?? []).filter((s) => s && Array.isArray(s.line))
        if (structured.length > 0) {
          setData({ structured, plain: r.plain ?? null, loading: false, error: null })
        } else {
          setData({ structured: null, plain: r.plain ?? null, loading: false, error: null })
        }
      } else {
        setData({ structured: null, plain: null, loading: false, error: r.error ?? '加载失败' })
      }
    })
    return () => { cancelled = true }
  }, [server, song?.id])

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