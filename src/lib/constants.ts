import type { IconName } from '@/components/Icon'
import type { ServiceConfig } from '@/types'

export const STORAGE_KEYS = {
  CONFIG: 'unraid_dash_config',
} as const

export function isAudiobookshelfService(service: ServiceConfig): boolean {
  const lowerType = (service.type ?? '').toLowerCase()
  const lowerName = (service.name ?? '').toLowerCase()
  return (
    lowerType === 'audiobookshelf' ||
    lowerType.includes('audiobook') ||
    lowerName.includes('audiobook')
  )
}

export const SERVICE_TYPE_LABELS: Record<string, string> = {
  jellyfin: 'Jellyfin',
  navidrome: 'Navidrome',
  audiobookshelf: 'Audiobookshelf',
  immich: 'Immich',
  filebrowser: 'FileBrowser',
  unraid: 'Unraid',
  custom: 'Custom',
  aria2: 'Aria2',
  calibre: 'Calibre',
  qbittorrent: 'qBittorrent',
  openlist: 'OpenList',
}

export const SERVICE_TYPE_ICONS: Record<string, IconName> = {
  jellyfin: 'jellyfin',
  navidrome: 'navidrome',
  audiobookshelf: 'audiobookshelf',
  immich: 'immich',
  filebrowser: 'filebrowser',
  unraid: 'unraid',
  custom: 'unraid',
  aria2: 'downloadCloud',
  calibre: 'calibre',
  qbittorrent: 'qbittorrent',
  openlist: 'openlist',
}