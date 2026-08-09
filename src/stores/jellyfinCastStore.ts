import { create } from 'zustand'
import { JellyfinServerConfig } from '@/types'
import type { UpnpDevice, PositionInfo, PlaybackState } from '@/lib/upnp/types'
import { setAVTransportURI, play as upnpPlay, pause as upnpPause, stop as upnpStop, seek as upnpSeek, getPositionInfo, getTransportInfo } from '@/lib/upnp/discovery'
import { buildStreamUrl } from '@/lib/upnp/streamUrl'
import { buildDidlLite, formatDuration } from '@/lib/upnp/didl'

interface CastState {
  server: JellyfinServerConfig | null
  /** 当前投屏到的电视（UPnP MediaRenderer） */
  target: UpnpDevice | null
  itemId: string | null
  itemName: string | null
  itemDurationSeconds: number
  /** 当前位置（秒） */
  positionSeconds: number
  /** 当前是否暂停 */
  paused: boolean
  error: string | null
  startedAt: number

  /** 调 setAVTransportURI + Play 让电视开始播放 Jellyfin 流 */
  startCast: (server: JellyfinServerConfig, target: UpnpDevice, itemId: string, itemName: string, opts?: {
    startPositionSeconds?: number
    durationSeconds?: number
  }) => Promise<{ ok: boolean; error?: string }>
  /** 停止投屏（电视端 Stop + 清 store） */
  stopCast: () => Promise<void>
  /** 轮询位置/状态 */
  refresh: () => Promise<void>
  pause: () => Promise<void>
  unpause: () => Promise<void>
  seek: (positionSeconds: number) => Promise<void>
  /** 切换到另一项（同一 itemId 内章节/上下集：再次 setAVTransportURI） */
  switchItem: (itemId: string, itemName: string, startPositionSeconds?: number, durationSeconds?: number) => Promise<void>
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
  itemDurationSeconds: 0,
  positionSeconds: 0,
  paused: false,
  error: null,
  startedAt: 0,

  startCast: async (server, target, itemId, itemName, opts) => {
    set({
      server, target, itemId, itemName,
      itemDurationSeconds: opts?.durationSeconds ?? 0,
      error: null, positionSeconds: opts?.startPositionSeconds ?? 0, paused: false,
      startedAt: Date.now(),
    })
    try {
      const streamUrl = buildStreamUrl(server, itemId)
      const metadata = buildDidlLite({
        itemId,
        title: itemName,
        itemClass: 'object.item.videoItem.movie',
        duration: formatDuration(opts?.durationSeconds ?? 0),
      })
      await setAVTransportURI(target.controlUrl, streamUrl, metadata)
      await upnpPlay(target.controlUrl)
      // 起轮询
      startPolling(get().refresh)
      return { ok: true }
    } catch (e: any) {
      const msg = e?.message ?? '投屏失败'
      set({ error: msg })
      get().clear()
      return { ok: false, error: msg }
    }
  },

  switchItem: async (itemId, itemName, startPositionSeconds, durationSeconds) => {
    const s = get()
    if (!s.server || !s.target) return
    try {
      const streamUrl = buildStreamUrl(s.server, itemId)
      const metadata = buildDidlLite({
        itemId,
        title: itemName,
        itemClass: 'object.item.videoItem.movie',
        duration: formatDuration(durationSeconds ?? s.itemDurationSeconds),
      })
      await setAVTransportURI(s.target.controlUrl, streamUrl, metadata)
      await upnpPlay(s.target.controlUrl)
      set({
        itemId, itemName,
        itemDurationSeconds: durationSeconds ?? s.itemDurationSeconds,
        positionSeconds: startPositionSeconds ?? 0,
        paused: false,
        error: null,
        startedAt: Date.now(),
      })
    } catch (e: any) {
      set({ error: e?.message ?? '切换失败' })
    }
  },

  stopCast: async () => {
    const s = get()
    if (s.target) {
      try { await upnpStop(s.target.controlUrl) } catch { /* ignore */ }
    }
    stopPolling()
    get().clear()
  },

  clear: () => set({
    server: null, target: null, itemId: null, itemName: null,
    itemDurationSeconds: 0, positionSeconds: 0, paused: false, error: null, startedAt: 0,
  }),

  refresh: async () => {
    const s = get()
    if (!s.target) return
    try {
      const [pos, info] = await Promise.all([
        getPositionInfo(s.target.controlUrl).catch(() => null),
        getTransportInfo(s.target.controlUrl).catch(() => null),
      ])
      const updates: Partial<CastState> = { error: null }
      if (pos) {
        updates.positionSeconds = pos.positionSeconds
        if (pos.durationSeconds > 0 && (s.itemDurationSeconds === 0 || Math.abs(pos.durationSeconds - s.itemDurationSeconds) > 2)) {
          updates.itemDurationSeconds = pos.durationSeconds
        }
      }
      if (info) {
        const mapped = mapPlaybackState(info.state)
        updates.paused = mapped === 'PAUSED'
      }
      set(updates)
    } catch (e: any) {
      // 单次轮询失败不打断
    }
  },

  pause: async () => {
    const s = get()
    if (!s.target) return
    try {
      await upnpPause(s.target.controlUrl)
      set({ paused: true })
    } catch (e: any) {
      set({ error: e?.message ?? '暂停失败' })
    }
  },

  unpause: async () => {
    const s = get()
    if (!s.target) return
    try {
      await upnpPlay(s.target.controlUrl)
      set({ paused: false })
    } catch (e: any) {
      set({ error: e?.message ?? '继续失败' })
    }
  },

  seek: async (positionSeconds) => {
    const s = get()
    if (!s.target) return
    try {
      await upnpSeek(s.target.controlUrl, positionSeconds)
      set({ positionSeconds })
    } catch (e: any) {
      set({ error: e?.message ?? '跳转失败' })
    }
  },
}))

function mapPlaybackState(s: string): PlaybackState {
  switch ((s ?? '').toUpperCase()) {
    case 'PLAYING': return 'PLAYING'
    case 'PAUSED_PLAYBACK':
    case 'PAUSED': return 'PAUSED'
    case 'STOPPED': return 'STOPPED'
    case 'TRANSITIONING': return 'TRANSITIONING'
    case 'NO_MEDIA_PRESENT': return 'NO_MEDIA_PRESENT'
    default: return 'UNKNOWN'
  }
}

export function clearJellyfinCastOnLogout() {
  stopPolling()
  useJellyfinCastStore.getState().clear()
}