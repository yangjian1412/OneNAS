export interface UpnpDevice {
  location: string
  friendlyName: string
  manufacturer: string
  modelName: string
  udn: string
  /** AVTransport service 的绝对 control URL（电视端的 SOAP 端点） */
  controlUrl: string
}

export type PlaybackState = 'PLAYING' | 'PAUSED' | 'STOPPED' | 'TRANSITIONING' | 'NO_MEDIA_PRESENT' | 'UNKNOWN'

export interface PositionInfo {
  positionSeconds: number
  durationSeconds: number
  relTimeRaw: string
  durationRaw: string
}

export interface TransportInfo {
  state: PlaybackState
  status: string
}