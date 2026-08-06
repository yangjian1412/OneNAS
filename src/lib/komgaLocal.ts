import AsyncStorage from '@react-native-async-storage/async-storage'
import type { KomgaSeries } from '@/types'

interface LocalStore {
  fav: Record<string, KomgaSeries[]>
  recent: Record<string, KomgaSeries[]>
}

async function load(): Promise<LocalStore> {
  try {
    const raw = await AsyncStorage.getItem('komga:local:v1')
    if (raw) {
      const parsed = JSON.parse(raw)
      return { fav: parsed.fav ?? {}, recent: parsed.recent ?? {} }
    }
  } catch {}
  return { fav: {}, recent: {} }
}

async function save(store: LocalStore): Promise<void> {
  await AsyncStorage.setItem('komga:local:v1', JSON.stringify(store))
}

// ── 本地书签（Komga ≥ 1.25 移除服务端书签 API）─────────────────────────────────

export interface KomgaLocalBookmark {
  bookId: string
  page: number
  created: string
}

function bmKey(serverId: string): string {
  return `komga:bookmarks:${serverId}`
}

async function loadBookmarks(serverId: string): Promise<KomgaLocalBookmark[]> {
  try {
    const raw = await AsyncStorage.getItem(bmKey(serverId))
    return raw ? JSON.parse(raw) : []
  } catch {}
  return []
}

async function saveBookmarks(serverId: string, list: KomgaLocalBookmark[]): Promise<void> {
  await AsyncStorage.setItem(bmKey(serverId), JSON.stringify(list))
}

export async function getBookmarks(serverId: string): Promise<KomgaLocalBookmark[]> {
  return loadBookmarks(serverId)
}

export async function isBookmarked(serverId: string, bookId: string): Promise<boolean> {
  const list = await loadBookmarks(serverId)
  return list.some((b) => b.bookId === bookId)
}

export async function getBookmarkPage(serverId: string, bookId: string): Promise<number | null> {
  const list = await loadBookmarks(serverId)
  const bm = list.find((b) => b.bookId === bookId)
  return bm?.page ?? null
}

export async function setBookmark(serverId: string, bookId: string, page: number): Promise<void> {
  const list = await loadBookmarks(serverId)
  const idx = list.findIndex((b) => b.bookId === bookId)
  const entry: KomgaLocalBookmark = { bookId, page, created: new Date().toISOString() }
  if (idx >= 0) {
    list[idx] = entry
  } else {
    list.unshift(entry)
  }
  await saveBookmarks(serverId, list)
}

export async function removeBookmark(serverId: string, bookId: string): Promise<void> {
  const list = await loadBookmarks(serverId)
  await saveBookmarks(serverId, list.filter((b) => b.bookId !== bookId))
}

export async function getFavSeries(serverId: string): Promise<KomgaSeries[]> {
  const store = await load()
  return store.fav[serverId] ?? []
}

export async function isFavSeries(serverId: string, seriesId: string): Promise<boolean> {
  const store = await load()
  return (store.fav[serverId] ?? []).some((s) => s.id === seriesId)
}

export async function toggleFavSeries(serverId: string, series: KomgaSeries): Promise<boolean> {
  const store = await load()
  const list = store.fav[serverId] ?? []
  const idx = list.findIndex((s) => s.id === series.id)
  if (idx >= 0) {
    list.splice(idx, 1)
    store.fav[serverId] = list
    await save(store)
    return false
  }
  store.fav[serverId] = [series, ...list]
  await save(store)
  return true
}

export async function getRecentSeries(serverId: string): Promise<KomgaSeries[]> {
  const store = await load()
  return store.recent[serverId] ?? []
}

export async function addRecentSeries(serverId: string, series: KomgaSeries): Promise<void> {
  const store = await load()
  const list = (store.recent[serverId] ?? []).filter((s) => s.id !== series.id)
  store.recent[serverId] = [series, ...list].slice(0, 20)
  await save(store)
}
