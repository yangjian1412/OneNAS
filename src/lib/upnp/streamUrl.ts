import type { JellyfinServerConfig } from '@/types'

/**
 * 构造 Jellyfin 流 URL 给电视端直接 fetch。
 * - api_key 作为 query 参数（用户已确认接受；仅电视端可见，限定本机 NAS）
 * - Static=true 表示 DirectPlay（不转码）；电视需支持媒体格式
 * - DeviceId 写死一个固定值，让服务端能识别
 *
 * 网络假设：手机与电视同 LAN，手机 → Jellyfin（公网/域名）走外网；
 * 电视 → Jellyfin（同一公网 URL）也走外网，所以服务端必须能通过该 URL 访问（即手机用的 URL）。
 */
export function buildStreamUrl(server: JellyfinServerConfig, itemId: string): string {
  const base = server.url.replace(/\/+$/, '')
  const url = `${base}/Videos/${itemId}/stream?Static=true&DeviceId=one-nas-dlna-tv&api_key=${encodeURIComponent(server.accessToken ?? '')}`
  return url
}

/** 同源流 URL，电视 fetch 时带 X-Emby-Token 头（部分 Jellyfin 部署支持） */
export function buildStreamUrlWithToken(server: JellyfinServerConfig, itemId: string): string {
  const base = server.url.replace(/\/+$/, '')
  return `${base}/Videos/${itemId}/stream?Static=true&DeviceId=one-nas-dlna-tv`
}

export function buildHeaderToken(server: JellyfinServerConfig): { 'X-Emby-Token'?: string; Authorization?: string } {
  if (!server.accessToken) return {}
  return { 'X-Emby-Token': server.accessToken }
}