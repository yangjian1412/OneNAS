import { NativeModules } from 'react-native'
import type { UpnpDevice, PositionInfo, TransportInfo } from './types'

const { UpnpModule } = NativeModules as {
  UpnpModule?: {
    discoverRenderers: (timeoutMs: number) => Promise<UpnpDevice[]>
    discoverDevices: (timeoutMs: number) => Promise<Array<{ location: string; st: string; usn: string; source: string }>>
    getDeviceDescription: (locationUrl: string) => Promise<UpnpDevice>
    setAVTransportURI: (controlUrl: string, currentUri: string, metadataXml: string | null) => Promise<void>
    play: (controlUrl: string) => Promise<void>
    pause: (controlUrl: string) => Promise<void>
    stop: (controlUrl: string) => Promise<void>
    seek: (controlUrl: string, targetSeconds: number) => Promise<void>
    getTransportInfo: (controlUrl: string) => Promise<TransportInfo>
    getPositionInfo: (controlUrl: string) => Promise<PositionInfo>
  }
}

function ensure() {
  if (!UpnpModule) {
    throw new Error('原生 UPnP 模块不可用（仅 Android 端）')
  }
  return UpnpModule
}

/**
 * 在手机所在 LAN 内做 SSDP M-SEARCH，自动拉取每个 MediaRenderer 的 device description，
 * 提取 AVTransport service 的 controlURL。**不依赖 Jellyfin/Emby 服务端 DLNA server。**
 */
export async function discoverRenderers(timeoutMs = 5000): Promise<UpnpDevice[]> {
  const m = ensure()
  try {
    const list = await m.discoverRenderers(timeoutMs)
    return list ?? []
  } catch (e: any) {
    throw new Error(`UPnP 发现失败：${e?.message ?? e}`)
  }
}

/**
 * 调电视的 AVTransport.SetAVTransportURI，让电视准备拉流。
 * @param controlUrl 电视端 AVTransport service 的 controlURL
 * @param currentUri 电视要去拉取的媒体 URL（Jellyfin 公网/域名流地址）
 * @param metadataXml 可选 DIDL-Lite XML metadata；部分电视严格要求此项
 */
export async function setAVTransportURI(
  controlUrl: string,
  currentUri: string,
  metadataXml?: string,
): Promise<void> {
  const m = ensure()
  await m.setAVTransportURI(controlUrl, currentUri, metadataXml ?? null)
}

export async function play(controlUrl: string): Promise<void> {
  const m = ensure()
  await m.play(controlUrl)
}

export async function pause(controlUrl: string): Promise<void> {
  const m = ensure()
  await m.pause(controlUrl)
}

export async function stop(controlUrl: string): Promise<void> {
  const m = ensure()
  await m.stop(controlUrl)
}

/** 跳转到绝对时间（秒） */
export async function seek(controlUrl: string, targetSeconds: number): Promise<void> {
  const m = ensure()
  await m.seek(controlUrl, Math.max(0, targetSeconds))
}

export async function getTransportInfo(controlUrl: string): Promise<TransportInfo> {
  const m = ensure()
  return await m.getTransportInfo(controlUrl)
}

export async function getPositionInfo(controlUrl: string): Promise<PositionInfo> {
  const m = ensure()
  return await m.getPositionInfo(controlUrl)
}

export function isAvailable(): boolean {
  return !!UpnpModule
}