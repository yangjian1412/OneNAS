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
  id: string
  bookId: string
  page: number
  title?: string
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

export async function getBookmarksForBook(serverId: string, bookId: string): Promise<KomgaLocalBookmark[]> {
  const list = await loadBookmarks(serverId)
  return list
    .filter((b) => b.bookId === bookId)
    .sort((a, b) => a.page - b.page)
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function addBookmark(serverId: string, bookId: string, page: number, title?: string): Promise<KomgaLocalBookmark> {
  const list = await loadBookmarks(serverId)
  const entry: KomgaLocalBookmark = { id: makeId(), bookId, page, title, created: new Date().toISOString() }
  list.unshift(entry)
  await saveBookmarks(serverId, list)
  return entry
}

export async function removeBookmarkById(serverId: string, id: string): Promise<void> {
  const list = await loadBookmarks(serverId)
  await saveBookmarks(serverId, list.filter((b) => b.id !== id))
}

export async function removeAllBookmarksForBook(serverId: string, bookId: string): Promise<void> {
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
