/**
 * 拼 DIDL-Lite metadata XML（UPnP AVTransport.SetAVTransportURI 第二参数）。
 * 部分电视/盒子严格要求 CurrentURIMetadata 含此结构（不是空字符串）。
 */

interface DidlLiteOptions {
  /** 媒体项 ID（Jellyfin itemId） */
  itemId: string
  /** 媒体标题 */
  title: string
  /** 媒体类（"movie" / "episode" / "audio.musictrack" / "video" 等） */
  itemClass?: string
  /** 时长（HH:MM:SS 或秒） */
  duration?: string
  /** 缩略图 URL（可空） */
  albumArtUri?: string
  /** 父对象 ID（可空） */
  parentId?: string
}

const DIDL_NS = 'xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:res="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"'

export function buildDidlLite(opts: DidlLiteOptions): string {
  const klass = opts.itemClass ?? 'object.item.videoItem.movie'
  const resAttrs: string[] = []
  if (opts.duration) resAttrs.push(`duration="${escapeAttr(opts.duration)}"`)
  resAttrs.push('protocolInfo="http-get:*:video/mp4:*"')
  const resLine = resAttrs.length ? `<res ${resAttrs.join(' ')}>${escapeXml(opts.itemId)}</res>` : ''

  const albumArt = opts.albumArtUri ? `<upnp:albumArtURI>${escapeXml(opts.albumArtUri)}</upnp:albumArtURI>` : ''

  return (
    `<DIDL-Lite ${DIDL_NS}>` +
    `<item id="${escapeAttr(opts.itemId)}" parentID="${escapeAttr(opts.parentId ?? '-1')}" restricted="1">` +
    `<dc:title>${escapeXml(opts.title)}</dc:title>` +
    `<upnp:class>${escapeXml(klass)}</upnp:class>` +
    albumArt +
    resLine +
    `</item>` +
    `</DIDL-Lite>`
  )
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}