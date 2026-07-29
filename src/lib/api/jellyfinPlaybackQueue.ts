import AsyncStorage from '@react-native-async-storage/async-storage'
import type { JellyfinServerConfig, PlaybackProgressPayload } from '@/types'
import { reportPlaybackProgress, reportPlaybackStop } from './jellyfinPlayback'

const QUEUE_KEY = 'jellyfin:playbackQueue'
const FLUSH_INTERVAL_MS = 30_000
const MAX_QUEUE_SIZE = 200

interface QueuedItem {
  type: 'progress' | 'stop'
  payload: PlaybackProgressPayload
  ts: number
  serverUrl: string
  serverUserId: string
  serverAccessToken: string
}

let cachedQueue: QueuedItem[] | null = null
let flushTimer: ReturnType<typeof setInterval> | null = null

async function loadQueue(): Promise<QueuedItem[]> {
  if (cachedQueue) return cachedQueue
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY)
    cachedQueue = raw ? (JSON.parse(raw) as QueuedItem[]) : []
  } catch {
    cachedQueue = []
  }
  return cachedQueue
}

async function saveQueue(queue: QueuedItem[]): Promise<void> {
  cachedQueue = queue
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {}
}

function serverMatches(item: QueuedItem, server: JellyfinServerConfig): boolean {
  return (
    item.serverUrl === server.url &&
    item.serverUserId === server.userId &&
    item.serverAccessToken === server.accessToken
  )
}

function buildStubServer(item: QueuedItem): JellyfinServerConfig {
  return {
    id: 'queued',
    name: 'queued',
    type: 'jellyfin',
    url: item.serverUrl,
    username: '',
    password: '',
    userId: item.serverUserId,
    accessToken: item.serverAccessToken,
  }
}

export async function enqueueProgress(
  server: JellyfinServerConfig,
  payload: PlaybackProgressPayload,
): Promise<void> {
  if (!server.userId || !server.accessToken) return
  const queue = await loadQueue()
  queue.push({
    type: 'progress',
    payload,
    ts: Date.now(),
    serverUrl: server.url,
    serverUserId: server.userId,
    serverAccessToken: server.accessToken,
  })
  while (queue.length > MAX_QUEUE_SIZE) queue.shift()
  await saveQueue(queue)
}

export async function enqueueStop(
  server: JellyfinServerConfig,
  payload: PlaybackProgressPayload,
): Promise<void> {
  if (!server.userId || !server.accessToken) return
  const queue = await loadQueue()
  queue.push({
    type: 'stop',
    payload,
    ts: Date.now(),
    serverUrl: server.url,
    serverUserId: server.userId,
    serverAccessToken: server.accessToken,
  })
  await saveQueue(queue)
}

export async function flushQueue(currentServer?: JellyfinServerConfig): Promise<{ flushed: number; remaining: number }> {
  const queue = await loadQueue()
  if (queue.length === 0) return { flushed: 0, remaining: 0 }

  const remaining: QueuedItem[] = []
  let flushed = 0

  for (const item of queue) {
    const server = currentServer && serverMatches(item, currentServer)
      ? currentServer
      : buildStubServer(item)
    try {
      const fn = item.type === 'stop' ? reportPlaybackStop : reportPlaybackProgress
      const r = await fn(server, item.payload)
      if (r.ok) {
        flushed++
      } else {
        remaining.push(item)
      }
    } catch {
      remaining.push(item)
    }
  }

  await saveQueue(remaining)
  return { flushed, remaining: remaining.length }
}

export function startAutoFlush(getServer: () => JellyfinServerConfig | null): void {
  if (flushTimer) return
  flushTimer = setInterval(async () => {
    const server = getServer()
    await flushQueue(server ?? undefined)
  }, FLUSH_INTERVAL_MS)
}

export function stopAutoFlush(): void {
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
}

export async function clearQueue(): Promise<void> {
  await saveQueue([])
}