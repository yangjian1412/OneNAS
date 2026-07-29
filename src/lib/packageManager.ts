import { NativeModules } from 'react-native'

interface PackageManagerModuleType {
  queryMarketApps(): Promise<string[]>
  launchApp(packageName: string, className: string): Promise<boolean>
}

const native = NativeModules.PackageManagerModule as PackageManagerModuleType | undefined

export async function queryMarketApps(): Promise<string[]> {
  if (!native) return []
  try {
    return await native.queryMarketApps()
  } catch {
    return []
  }
}

export async function launchApp(packageName: string, className: string): Promise<boolean> {
  if (!native) {
    console.warn('[PackageManager] native module not registered')
    return false
  }
  try {
    await native.launchApp(packageName, className)
    console.log('[PackageManager] launchApp success:', packageName)
    return true
  } catch (e: any) {
    console.warn('[PackageManager] launchApp failed:', packageName, e?.message || e)
    return false
  }
}