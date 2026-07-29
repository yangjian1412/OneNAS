import { NativeModules } from 'react-native'

interface SystemVolumeNative {
  getMaxVolume(): Promise<number>
  getCurrentVolume(): Promise<number>
  setVolume(value: number): Promise<number>
}

const Native: SystemVolumeNative | undefined = (NativeModules as any).SystemVolume

export async function getSystemMaxVolume(): Promise<number> {
  if (!Native) return 15
  return Native.getMaxVolume()
}

export async function getSystemCurrentVolume(): Promise<number> {
  if (!Native) return 0
  return Native.getCurrentVolume()
}

export async function setSystemVolume(ratio: number): Promise<number> {
  if (!Native) return ratio
  return Native.setVolume(Math.max(0, Math.min(1, ratio)))
}