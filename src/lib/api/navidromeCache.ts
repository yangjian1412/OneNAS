import AsyncStorage from '@react-native-async-storage/async-storage'

const CACHE_PREFIX = 'navidrome:api:'

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    if (Date.now() - entry.timestamp > entry.ttl) {
      await AsyncStorage.removeItem(CACHE_PREFIX + key)
      return null
    }
    return entry.data
  } catch {
    return null
  }
}

export async function setCached<T>(key: string, data: T, ttl: number): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now(), ttl }
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry))
  } catch {}
}

export async function clearNavidromeCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX))
    if (cacheKeys.length > 0) await AsyncStorage.multiRemove(cacheKeys)
  } catch {}
}