export interface ServiceChangelogEntry {
  version: string
  items: string[]
}

export interface ServiceVersionInfo {
  key: string
  name: string
  version: string
  entries: ServiceChangelogEntry[]
}

export const SERVICE_VERSIONS: ServiceVersionInfo[] = [
  {
    key: 'filebrowser',
    name: '文件管理',
    version: '1.0.2',
    entries: [
      { version: '1.0.2', items: ['文件详情与 MD5/SHA 校验和'] },
      { version: '1.0.1', items: ['全格式预览编辑：文本/代码/图片/HTML/音视频/PDF/Office，支持 GBK 编码'] },
      { version: '1.0.0', items: ['上线文件管理：目录浏览、搜索、ZIP 打包下载、下载管理'] },
    ],
  },
  {
    key: 'webdav',
    name: 'WebDAV',
    version: '1.0.0',
    entries: [{ version: '1.0.0', items: ['上线 WebDAV 后端：浏览、上传、下载、预览'] }],
  },
  {
    key: 'unraid',
    name: 'Unraid',
    version: '1.0.0',
    entries: [
      { version: '1.0.0', items: ['上线 NAS 管理：CPU/内存/磁盘仪表、Docker 容器与虚拟机管理'] },
    ],
  },
  {
    key: 'portainer',
    name: 'Portainer',
    version: '1.0.0',
    entries: [{ version: '1.0.0', items: ['上线 Portainer 后端：Docker 容器管理'] }],
  },
  {
    key: 'jellyfin',
    name: 'Jellyfin',
    version: '1.0.2',
    entries: [
      { version: '1.0.2', items: ['直播电视频道'] },
      { version: '1.0.1', items: ['DLNA 投屏到电视'] },
      { version: '1.0.0', items: ['上线 Jellyfin：媒体库浏览、影片详情、手势视频播放器'] },
    ],
  },
  {
    key: 'emby',
    name: 'Emby',
    version: '1.0.1',
    entries: [
      { version: '1.0.1', items: ['DLNA 投屏到电视'] },
      { version: '1.0.0', items: ['上线 Emby：与 Jellyfin 同套浏览与播放界面'] },
    ],
  },
  {
    key: 'navidrome',
    name: 'Navidrome',
    version: '1.0.3',
    entries: [
      { version: '1.0.3', items: ['歌单管理与歌曲操作（多选、增删歌曲）'] },
      { version: '1.0.2', items: ['歌词三种显示模式（桌面悬浮/系统播放器/锁屏）'] },
      { version: '1.0.1', items: ['后台播放与完整播放器'] },
      { version: '1.0.0', items: ['上线 Navidrome：音乐库浏览、在线播放'] },
    ],
  },
  {
    key: 'audiobookshelf',
    name: 'Audiobookshelf',
    version: '1.0.2',
    entries: [
      { version: '1.0.2', items: ['迷你播放器'] },
      { version: '1.0.1', items: ['播放器增强：倍速、睡眠定时、书签、播放列表'] },
      { version: '1.0.0', items: ['上线 Audiobookshelf：书库、章节续播、后台播放'] },
    ],
  },
  {
    key: 'talebook',
    name: 'Talebook',
    version: '1.0.2',
    entries: [
      { version: '1.0.2', items: ['内嵌登录页 + 我的书架兼容'] },
      { version: '1.0.1', items: ['最近浏览记录'] },
      { version: '1.0.0', items: ['上线 Talebook：书库、在线阅读、书架'] },
    ],
  },
  {
    key: 'komga',
    name: 'Komga',
    version: '1.0.2',
    entries: [
      { version: '1.0.2', items: ['阅读器重制：条漫模式、分区点击翻页、书签'] },
      { version: '1.0.1', items: ['系列书架与整本缓存'] },
      { version: '1.0.0', items: ['上线 Komga：漫画库、系列详情、阅读器'] },
    ],
  },
  {
    key: 'openlist',
    name: 'OpenList',
    version: '1.0.1',
    entries: [
      { version: '1.0.1', items: ['推送文件到 aria2 下载'] },
      { version: '1.0.0', items: ['上线 OpenList：浏览、上传、排序、多选工具栏'] },
    ],
  },
  {
    key: 'aria2',
    name: 'Aria2',
    version: '1.0.0',
    entries: [{ version: '1.0.0', items: ['上线 Aria2：任务列表、新建下载、任务管理'] }],
  },
  {
    key: 'qbittorrent',
    name: 'qBittorrent',
    version: '1.0.0',
    entries: [{ version: '1.0.0', items: ['上线 qBittorrent：任务列表、新建下载、任务管理'] }],
  },
  {
    key: 'immich',
    name: 'Immich',
    version: '1.0.0',
    entries: [{ version: '1.0.0', items: ['上线 Immich 快捷入口（跳转官方 App）'] }],
  },
]
