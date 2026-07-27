import AsyncStorage from '@react-native-async-storage/async-storage'

export async function loadItem<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key)
  if (!raw) return null
  return JSON.parse(raw) as T
}

export async function saveItem<T>(key: string, data: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(data))
}