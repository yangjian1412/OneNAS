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
