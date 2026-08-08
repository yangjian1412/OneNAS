import { create } from 'zustand'
import { JellyfinServerConfig, JellyfinSession } from '@/types'
import { jellyfinCast, jellyfinSendPlaystate, jellyfinGetSessionById } from '@/lib/api/jellyfin'

interface CastState {
  server: JellyfinServerConfig | null
  target: JellyfinSession | null
  itemId: string | null
  itemName: string | null
  positionTicks: number
  durationTicks: number
  paused: boolean
  error: string | null
  startedAt: number

  startCast: (server: JellyfinServerConfig, target: JellyfinSession, itemId: string, itemName: string, opts?: { startPositionTicks?: number; mediaSourceId?: string; audioStreamIndex?: number; subtitleStreamIndex?: number }) => Promise<{ ok: boolean; error?: string }>
  stopCast: () => Promise<void>
  refresh: () => Promise<void>
  pause: () => Promise<void>
  unpause: () => Promise<void>
  stop: () => Promise<void>
  seek: (positionTicks: number) => Promise<void>
  next: () => Promise<void>
  previous: () => Promise<void>
  clear: () => void
}

let pollTimer: ReturnType<typeof setInterval> | null = null
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } }
function startPolling(refresh: () => Promise<void>) {
  stopPolling()
  pollTimer = setInterval(() => { void refresh() }, 5000)
}

export const useJellyfinCastStore = create<CastState>((set, get) => ({
  server: null,
  target: null,
  itemId: null,
  itemName: null,
  positionTicks: 0,
  durationTicks: 0,
  paused: false,
  error: null,
  startedAt: 0,

  startCast: async (server, target, itemId, itemName, opts) => {
    set({ server, target, itemId, itemName, error: null, positionTicks: 0, durationTicks: 0, paused: false, startedAt: Date.now() })
    const r = await jellyfinCast(server, target.Id, {
      itemId,
      startPositionTicks: opts?.startPositionTicks,
      mediaSourceId: opts?.mediaSourceId,
      audioStreamIndex: opts?.audioStreamIndex,
      subtitleStreamIndex: opts?.subtitleStreamIndex,
    })
    if (!r.ok) {
      set({ error: r.error ?? '投屏失败' })
      return { ok: false, error: r.error }
    }
    startPolling(get().refresh)
    return { ok: true }
  },

  stopCast: async () => {
    const s = get()
    if (s.server && s.target) {
      try { await jellyfinSendPlaystate(s.server, s.target.Id, 'Stop') } catch { /* ignore */ }
    }
    stopPolling()
    get().clear()
  },

  clear: () => set({ server: null, target: null, itemId: null, itemName: null, positionTicks: 0, durationTicks: 0, paused: false, error: null, startedAt: 0 }),

  refresh: async () => {
    const s = get()
    if (!s.server || !s.target) return
    const r = await jellyfinGetSessionById(s.server, s.target.Id)
    if (!r.ok || !r.session) {
      // session 已离线，保留 last state 以提示用户
      set({ error: r.error ?? 'session 已离线' })
      return
    }
    const session = r.session
    const ps = session.PlayState
    set({
      target: session,
      positionTicks: ps?.PositionTicks ?? 0,
      paused: ps?.IsPaused ?? false,
      durationTicks: session.NowPlayingItem?.RunTimeTicks ?? s.durationTicks,
      error: null,
    })
  },

  pause: async () => {
    const s = get()
    if (!s.server || !s.target) return
    await jellyfinSendPlaystate(s.server, s.target.Id, 'Pause')
    set({ paused: true })
  },

  unpause: async () => {
    const s = get()
    if (!s.server || !s.target) return
    await jellyfinSendPlaystate(s.server, s.target.Id, 'Unpause')
    set({ paused: false })
  },

  stop: async () => {
    await get().stopCast()
  },

  seek: async (positionTicks) => {
    const s = get()
    if (!s.server || !s.target) return
    await jellyfinSendPlaystate(s.server, s.target.Id, 'Seek', positionTicks)
    set({ positionTicks })
  },

  next: async () => {
    const s = get()
    if (!s.server || !s.target) return
    await jellyfinSendPlaystate(s.server, s.target.Id, 'NextTrack')
  },

  previous: async () => {
    const s = get()
    if (!s.server || !s.target) return
    await jellyfinSendPlaystate(s.server, s.target.Id, 'PreviousTrack')
  },
}))

export function clearJellyfinCastOnLogout() {
  stopPolling()
  useJellyfinCastStore.getState().clear()
}