import { NativeModules, Platform } from 'react-native'
import { DownloadProgress, DownloadTask } from '@/types'

const { DownloadManagerModule } = NativeModules

const isAndroid = Platform.OS === 'android'

export async function checkStoragePermission(): Promise<boolean> {
  if (!isAndroid || !DownloadManagerModule) return false
  try {
    return await DownloadManagerModule.isExternalStorageManager() as boolean
  } catch {
    return false
  }
}

export function openAllFilesSettings() {
  if (!isAndroid || !DownloadManagerModule) return
  DownloadManagerModule.openAllFilesAccessSettings()
}

let downloadIdCounter = 0
const taskMap = new Map<number, { fileName: string; url: string; nativeId: number }>()

export async function enqueueDownload(
  url: string,
  fileName: string,
  authToken: string,
): Promise<DownloadTask> {
  if (!isAndroid || !DownloadManagerModule) throw new Error('Not supported on this platform')

  const nativeId = await DownloadManagerModule.enqueueDownload(url, fileName, authToken) as number

  downloadIdCounter++
  const id = downloadIdCounter

  const progress: DownloadProgress = {
    bytesDownloaded: 0,
    totalBytes: 0,
    status: 'pending',
    uri: '',
  }

  taskMap.set(id, { fileName, url, nativeId })

  return { id, fileName, url, progress }
}

export async function enqueueDownloadWithHeader(
  url: string,
  fileName: string,
  headerName: string,
  headerValue: string,
): Promise<DownloadTask> {
  if (!isAndroid || !DownloadManagerModule) throw new Error('Not supported on this platform')

  const nativeId = await DownloadManagerModule.enqueueDownloadWithHeader(url, fileName, headerName, headerValue) as number

  downloadIdCounter++
  const id = downloadIdCounter

  const progress: DownloadProgress = {
    bytesDownloaded: 0,
    totalBytes: 0,
    status: 'pending',
    uri: '',
  }

  taskMap.set(id, { fileName, url, nativeId })

  return { id, fileName, url, progress }
}

async function queryProgress(nativeId: number): Promise<DownloadProgress> {
  if (!isAndroid || !DownloadManagerModule) {
    return { bytesDownloaded: 0, totalBytes: 0, status: 'unknown', uri: '' }
  }
  try {
    const result = await DownloadManagerModule.queryProgress(nativeId) as DownloadProgress
    return result
  } catch {
    return { bytesDownloaded: 0, totalBytes: 0, status: 'unknown', uri: '' }
  }
}

export function cancelDownload(downloadId: number) {
  if (!isAndroid || !DownloadManagerModule) return
  const task = taskMap.get(downloadId)
  if (task) {
    DownloadManagerModule.cancelDownload(task.nativeId)
    taskMap.delete(downloadId)
  }
}

export function removeDownload(downloadId: number) {
  if (!isAndroid || !DownloadManagerModule) return
  const task = taskMap.get(downloadId)
  if (task) {
    DownloadManagerModule.removeDownload(task.nativeId)
    taskMap.delete(downloadId)
  }
}

export async function pollTaskProgress(task: DownloadTask): Promise<DownloadTask> {
  const entry = taskMap.get(task.id)
  if (!entry) return task
  const progress = await queryProgress(entry.nativeId)
  return { ...task, progress }
}
