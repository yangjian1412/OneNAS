# One NAS

<div align="center">

**面向 Unraid NAS 的原生 Android 管理面板** — 文件管理、Docker 容器、系统监控、多媒体，统一入口。

[![Platform](https://img.shields.io/badge/Platform-Android-green?style=flat-square&logo=android)](https://github.com/yourusername/one-nas)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)
[![Expo SDK](https://img.shields.io/badge/Expo%20SDK-57-black?style=flat-square&logo=expo)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.86-blue?style=flat-square&logo=react)](https://reactnative.dev)

**APK 已发布** · 支持 arm64-v8a · 约 52 MB

</div>

---

## 服务端要求

| 服务 | 最低版本 | 说明 |
|---|---|---|
| **Unraid OS** | 7.1+ | 7.x 系列均可，推荐 7.2+ |
| **Unraid API 插件** | **≥ 4.35.0** | 提供 Docker 容器 `restart` 突变（4.32-4.34 缺此字段，本 App 会自动 fallback 为 `stop + sleep + start`，但版本≥4.35 体验最优） |

升级方式：WebGUI → Settings → Management Access → API Keys 页签 → 升级 Unraid API 插件到 latest。

---

## 功能亮点

### 文件管理（Tab1：FileBrowser / WebDAV 双后端）

- 原生文件浏览器 — 浏览、上传、下载、新建、重命名、复制、移动、删除
- **双后端并列**（设置中切换）：
  - **FileBrowser**（默认）— 原生 FileBrowser API
  - **WebDAV** — Basic auth 走 PROPFIND/PUT/MOVE/DELETE（`src/lib/api/webdav.ts`）
- **文件夹 ZIP 打包下载** — 多选文件/文件夹打包，调用系统 DownloadManager 后台下载
- **文件预览** — 文本、代码、JSON、HTML、图片、PDF、Office、**视频**、**音频**（直链不转码）
- **文件编辑** — 文本/代码在线编辑，`PUT` 保存
- **分享** — 创建带密码/过期时间的分享链接，一键复制（FileBrowser only）
- **流式搜索** — 边搜边显示，支持按目录范围搜索
- 列表/平铺视图切换，8 类文件类型图标，多选/批量操作
- 系统返回键智能处理（子目录→上级→根目录→退出）

### NAS 系统管理（Tab4：DockerScreen）

- 系统资源**仪表盘** — CPU / 内存 / 阵列环形进度
- **磁盘列表** — 温度、容量、状态一览，支持 PARITY/DATA/CACHE 分类型显示
- **Docker 容器** — 启动/停止/重启/暂停/恢复，容器详情弹窗
- **虚拟机管理** — 启动/停止/重启/暂停/恢复 + 状态查看
- Auto Refresh（5 秒间隔，20 秒超时保护）
- Docker Screen 顶部固定服务栏（Audiobookshelf / Jellyfin / Emby / Navidrome / Talebook / qBittorrent / OpenList / aria2）

### 多媒体服务（独立全屏 + 顶栏卡片）

每个服务都有专属 Screen + Store + 抽屉 + 缓存层：

| 服务 | Screen | Store | 缓存 | 说明 |
|---|---|---|---|---|
| **Jellyfin** | ✅ | ✅ | AsyncStorage (5min) | 季/剧集/详情/直链播放 |
| **Emby** | ✅ | 复用 Jellyfin | 复用 | 同 Jellyfin 协议，独立 service type |
| **Navidrome** | ✅ | ✅ | AsyncStorage | 专辑/歌曲/播放器/歌词/后台播放 |
| **Audiobookshelf** | ✅ | ✅ | - | 章节/书签/后台播放 |
| **Talebook** | ✅ | ✅ + 本地浏览历史 | - | 服务页/书架/搜索/阅读，本地"最近浏览"列表 |
| **qBittorrent** | ✅ | ✅ | - | 任务管理 + 过滤 |
| **OpenList** | ✅ | ✅ | - | 文件浏览 + 推 aria2 |
| **aria2** | ✅ | ✅ | - | 任务管理 + 全局选项 |
| **Immich** | 跳转官方 App | - | - | - |

所有服务统一遵循：单例 polling 放在 Store 中（防止 tab2/3 + 顶栏多实例并发抢资源），三列顶栏布局 (`<ServiceHeader>` 或各自 Header)，抽屉式用户菜单 (`<ServiceDrawer>`)。

### 顶栏固定服务栏

- 设置 → 服务设置 中为每个服务勾选"在顶栏显示"
- 启用的服务在 FileScreen 顶部以图标形式**横向自由滚动**显示，无数量限制
- 点击展开为**内嵌卡片**（复用 Store）或**跳转原生 App**
- 内嵌卡片与对应 Tab 共享同一 Store 单例

### 主题 & 配置

- 浅色 / 深色 / 跟随系统
- AES 加密配置导出/导入（含口令）

### 原生体验

- **原生 Splash 文字"One NAS"** — 阶段1 纯色、阶段2 居中显示（下方 1/4 区域，避免与系统 splash 比例错位）
- Adaptive Icon（深蓝机架图标 `#1b3a8c`）
- 精确权限检测（"所有文件访问权限"引导）
- 后台下载走 Android `DownloadManager`（原生 Kotlin 模块 `DownloadManagerModule`）

---

## 截图

> 截图待补

---

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | React Native 0.86 + Expo SDK 57 |
| 语言 | TypeScript |
| 状态管理 | Zustand + AsyncStorage 持久化 |
| 导航 | @react-navigation/native + bottom-tabs |
| 文件/上传 | expo-file-system + expo-document-picker |
| 后台下载 | Android DownloadManager（原生 Kotlin 模块） |
| 音视频 | expo-video + expo-audio（Media3/ExoPlayer） |
| 图标 | react-native-svg + 自定义 SVG |
| 后端 | 直接对接 FileBrowser API / WebDAV / Unraid GraphQL / 各服务自身 REST，无独立后端 |

---

## 快速开始

### 环境

- Node.js 20+
- JDK 17（Temurin）
- Android SDK API 35+ / NDK 27.x

### 安装

```bash
npm install
# Windows 中国大陆用户额外执行：
powershell -ExecutionPolicy Bypass -File ./fix-android-env.ps1
```

### 构建

```bash
# 构建 APK
cd android && .\gradlew.bat assembleDebug

# 安装到设备
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

APK 产物：`android/app/build/outputs/apk/debug/app-debug.apk`（约 52 MB，仅 arm64-v8a）

---

## 项目结构

```
src/
├── App.tsx                          # 入口
├── navigation/TabNavigator.tsx      # 4 个 Tab（文件 / 服务 / 服务 / NAS）
├── screens/
│   ├── FileScreen.tsx               # 文件管理（FileBrowser/WebDAV + 顶栏卡片）
│   ├── ServiceScreen.tsx            # 通用服务入口 fallback（WebView 或浏览器跳转）
│   ├── DockerScreen.tsx             # NAS 系统管理
│   ├── SettingsScreen.tsx           # 设置
│   ├── JellyfinScreen.tsx
│   ├── NavidromeScreen.tsx
│   ├── AudiobookshelfScreen.tsx
│   ├── TalebookScreen.tsx
│   ├── QBitTorrentScreen.tsx
│   ├── OpenListScreen.tsx
│   └── Aria2Screen.tsx
├── components/                      # ServiceHeader / ServiceDrawer / FullScreenModal 等共享组件
├── stores/
│   ├── appStore.ts                  # 全局：servers/services/theme/config/downloads
│   ├── jellyfinStore.ts / jellyfinPlaybackStore.ts
│   ├── navidromeStore.ts / navidromePlaybackStore.ts / navidromeLyricsStore.ts
│   ├── audiobookshelfStore.ts / ...PlaybackStore.ts
│   ├── talebookStore.ts             # 含本地浏览历史（AsyncStorage, max 10 条）
│   ├── aria2Store.ts / qbittorrentStore.ts / openlistStore.ts
└── lib/
    ├── api/
    │   ├── client.ts                # apiFetch / apiGraphQL / buildUrl 底层
    │   ├── filebrowser.ts / webdav.ts / fileManager.ts
    │   ├── unraid.ts                # GraphQL mutations（容器/VM）
    │   ├── unraidCapabilities.ts    # Introspection 探测 DockerMutations 能力
    │   ├── jellyfin.ts / jellyfinCache.ts / jellyfinPlayback.ts
    │   ├── navidrome.ts / navidromeCache.ts
    │   ├── audiobookshelf.ts / talebook.ts / talebookCache.ts
    │   └── aria2.ts / qbittorrent.ts / openlist.ts
    ├── android-intent.ts            # 跳 Immich / Talebook 官方 App
    ├── downloadManager.ts           # 原生 DownloadManager 封装
    └── theme.ts / constants.ts

android/app/src/main/java/com/unraiddash/app/
├── DownloadManagerModule.kt         # 原生下载模块
├── MainActivity.kt                  # AppTheme（处理 splash 衔接）
└── MainApplication.kt               # 模块注册
```

---

## 关键设计

### Unraid API 兼容性（Docker 容器操作）

服务端 Unraid API 不同版本的 `DockerMutations` 字段集不同：

| Unraid API 版本 | `start` | `stop` | `restart` | `pause` | `unpause` |
|---|---|---|---|---|---|
| 4.32.x | ✅ | ✅ | ❌ | ✅ | ✅ |
| 4.33-4.34 | ✅ | ✅ | ❌ | ✅ | ✅ |
| **4.35+** | ✅ | ✅ | ✅ | ✅ | ✅ |

App 端 (`src/lib/api/unraidCapabilities.ts`)：
1. 首次调用任一 mutation 或进入 DockerScreen 时，发 introspection query `{ __type(name: "DockerMutations") { fields { name } } }`
2. 探测结果按 server.id 缓存到内存（不持久化，避免服务端升级后旧缓存误导）
3. `restartContainer` 路由：探测有 `restart` → 直接用；没有 → fallback `stop` + sleep 1.5s + `start`
4. 服务端返回 `Cannot query field` 错误时，自动 invalidate cache，下次重新探测

### WebDAV 实现要点（`src/lib/api/webdav.ts`）

- **PROPFIND body 必须显式**：发送 `<?xml ...><D:propfind><D:prop><D:resourcetype/><D:getcontentlength/><D:getlastmodified/><D:displayname/></D:prop></D:propfind>`。Alist / OpenList / 部分 NAS 在不带 body 的 PROPFIND 响应里不返回 `<D:resourcetype>`，会导致所有目录被误判为文件
- **UTF-8 → Base64**：RN Hermes 无 `btoa`，自实现 `utf8Encode` + `toBase64`（**禁止**用 `btoa(unescape(encodeURIComponent(...)))`，Hermes 抛错）
- **XML 解析**：`PROPFIND` 返回的多状态 XML (207) 标签带命名空间前缀（`<D:href>`、`<d:getcontentlength>`），正则 `(?:[A-Za-z]+:)?${tag}` 兼容
- **路径编码**：`joinDavUrl` 用 RFC 3986 段编码（`encodeURIComponent` + 转义 `!'()*`），正确处理中文 / 非 ASCII 文件名
- **目录尾斜杠**：目录的 PROPFIND（`webDavList`、`webDavGetResourceInfo` 且 isDir）URL 必须以 `/` 结尾——Apache mod_dav 无尾斜杠会 301 并把 Location 降级为 `http://`，RN fetch 跳转时丢 Authorization → 401；文件则无斜杠
- **路径**：所有 API 入参都用相对路径 `/foo/bar.txt`；`normalizeRelativePath(p)` 去 URL 前缀
- **支持**：浏览 / 上传 (PUT) / 创建文件夹 (MKCOL) / 删除 (DELETE) / 重命名 (MOVE) / 复制 (COPY) / 资源详情 / 文本编辑 (PUT) / 下载 / 预览（图 / 视频 / 音频 / 文本 / PDF / Office）
- **不支持（UI 隐藏）**：搜索、checksum、分享、文件夹打包下载

### 多实例 Store 单例

DockerScreen / 各服务 Screen **在 tab 内 + 顶栏内联** 各挂一份。两个实例必须共享同一 Store（zustand singleton）才能避免 polling 抢资源。所有 auto-refresh 的 `setInterval` 必须写在 Store 中，Screen 中**严禁**再写 useEffect setInterval。模板见 AGENTS.md。

---

## 下一步计划

详见 [docs/NEXT-PLAN.md](./docs/NEXT-PLAN.md)。

---

## 许可证

[MIT](./LICENSE)