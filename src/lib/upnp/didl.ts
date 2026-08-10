/**
 * 拼 DIDL-Lite metadata XML（UPnP AVTransport.SetAVTransportURI 第二参数）。
 * 电视/盒子用这个 XML 解析出资源 URL（<res> 内）和协议特征（protocolInfo），
 * 必须正确，否则 SetAVTransportURI 返回 HTTP 400。
 *
 * 关键：
 * - <res> 内容必须是可拉取的媒体 URL（不是 itemId 数字）
 * - protocolInfo 必须带 DLNA 操作标志（OP/CI/FLAGS），严格电视必需
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
  /** 实际可被电视拉取的媒体资源 URL（<res> 内容） */
  currentUri: string
}

const DIDL_NS = 'xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"'

// 常见 DLNA operation flag 组合：00=00=01=00 表示 Direct play；CI=0 不加密；
// FLAGS=01700000000000000000000000000000 是 Jellyfin/Emby 默认值。
// **DLNA.ORG_PN=MP4 是 Sony/Huey 等严格 DMR 必需的**，缺了 SetAVTransportURI 返回 402 Invalid Args。
const DEFAULT_PROTOCOL_INFO = 'http-get:*:video/mp4:DLNA.ORG_PN=MP4;DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000'

export function buildDidlLite(opts: DidlLiteOptions): string {
  const klass = opts.itemClass ?? 'object.item.videoItem.movie'
  const resAttrs: string[] = []
  if (opts.duration) resAttrs.push(`duration="${escapeAttr(opts.duration)}"`)
  resAttrs.push(`protocolInfo="${DEFAULT_PROTOCOL_INFO}"`)
  // <res> 内必须放流 URL，让电视去 GET；itemId 放在 item@id 上即可
  const resLine = `<res ${resAttrs.join(' ')}>${escapeXml(opts.currentUri)}</res>`

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
