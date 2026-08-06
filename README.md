# One NAS

你是否还在为自己组装的nas没有成品nas的统一app而烦恼，你是否因为在nas里面装了无数第三方服务后需要下载一堆app而困扰。有些官方应用大而笨重，各个应用都有重复的媒体播放库，有些甚至只有网页端。
本项目是个入坑nas时候不小心选择了unraid，又错过了fnOS的小白对着各种成品nas的app陷入沉思的时候，心血来潮在vibe coding的大潮之下手搓的聚合nas服务，将常见开源服务统一打包进一个app，让使用无官方app的nas或者都是第三方服务的nas可以享受80%原始app的体验。
欢迎大家试用，也欢迎大家往里面补充新的服务页面。
所有代码均为ai手搓，也欢迎有能力的同学随时优化提升，完全开源，注明原作者（@六分仪）即可。

## 功能亮点

### 文件管理（Tab1：FileBrowser / WebDAV 双后端）

- 原生文件浏览器 — 浏览、上传、下载、新建、重命名、复制、移动、删除
- **双后端并列**（设置中切换）：
  - **FileBrowser**（默认）— 原生 FileBrowser API
  - **WebDAV** — Basic auth 走 PROPFIND/PUT/MOVE/DELETE
- **文件夹 ZIP 打包下载** — 多选文件/文件夹打包，调用系统 DownloadManager 后台下载
- **文件预览** — 文本、代码、JSON、HTML、图片、PDF、Office、**视频**、**音频**（直链不转码）
- **文件编辑** — 文本/代码在线编辑，`PUT` 保存
- **分享** — 创建带密码/过期时间的分享链接，一键复制（FileBrowser only）
- **流式搜索** — 边搜边显示，支持按目录范围搜索
- 列表/平铺视图切换，8 类文件类型图标，多选/批量操作
- 系统返回键智能处理（子目录→上级→根目录→退出）

### NAS 系统管理（Tab4：Unraid / Docker–Portainer 双后端）

- 系统资源**仪表盘** — CPU / 内存 / 阵列环形进度
- **磁盘列表** — 温度、容量、状态一览，支持 PARITY/DATA/CACHE 分类型显示
- **Docker 容器** — 启动/停止/重启/暂停/恢复，容器详情弹窗
- **虚拟机管理** — 启动/停止/重启/暂停/恢复 + 状态查看
- Auto Refresh（5 秒间隔，20 秒超时保护）
- **双后端并列**（设置中切换，Tab 图标随之变化）：
  - **Unraid**（默认）— GraphQL 直连，introspection 自动探测 Docker 能力
  - **Docker（Portainer）** — Portainer REST API + Access Token（`X-Api-Key` / `Bearer`）
- 顶栏固定服务栏（Audiobookshelf / Jellyfin / Emby / Navidrome / Talebook / qBittorrent / OpenList / aria2）

---

### 多媒体服务（独立全屏 + 顶栏卡片）

每个服务都有专属 Screen + Store + 抽屉 + 缓存层：

| 服务 | Screen | Store | 缓存 | 说明 |
|---|---|---|---|---|
| **Jellyfin** | `JellyfinScreen` | `jellyfinStore` + `jellyfinPlaybackStore` | `jellyfinCache` (5min) | 季/剧集/详情/直链播放 |
| **Emby** | 复用 Jellyfin | 复用 | 复用 | 同 Jellyfin 协议，独立 service type |
| **Navidrome** | `NavidromeScreen` | `navidromeStore` + `navidromePlaybackStore` + `navidromeLyricsStore` | `navidromeCache` | 专辑/歌曲/播放器/歌词/后台播放 |
| **Audiobookshelf** | `AudiobookshelfScreen` | `audiobookshelfStore` + `audiobookshelfPlaybackStore` | - | 章节/书签/后台播放 |
| **Talebook** | `TalebookScreen` | `talebookStore` + 本地浏览历史 | `talebookCache` | 服务页/书架/搜索/阅读，本地"最近浏览"列表 |
| **qBittorrent** | `QBitTorrentScreen` | `qbittorrentStore` | - | 任务管理 + 过滤 |
| **OpenList** | `OpenListScreen` | `openlistStore` | - | 文件浏览 + 推 aria2 |
| **aria2** | `Aria2Screen` | `aria2Store` | - | 任务管理 + 全局选项 |
| **Komga** | `KomgaScreen` | `komgaStore` | `komgaCache` | 漫画库/系列/阅读器（翻页/条漫/书签） |
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

> 设置页（`docs/settings-screenshot.jpg`）

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
# 构建 APK（release 复用 debug.keystore 签名，可直接覆盖安装）
cd android && .\gradlew.bat assembleRelease

# 安装到设备
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

APK 产物：`android/app/build/outputs/apk/release/app-release.apk`（约 39 MB，仅 arm64-v8a）

---

## 项目结构

```
src/
├── App.tsx                          # 入口
├── navigation/TabNavigator.tsx      # 4 个 Tab（文件 / 服务 / 服务 / NAS）
├── screens/
│   ├── FileScreen.tsx               # 文件管理（FileBrowser/WebDAV + 顶栏卡片）
│   ├── ServiceScreen.tsx            # 通用服务入口 fallback（WebView 或浏览器跳转）
│   ├── DockerScreen.tsx             # NAS 系统管理（Unraid）
│   ├── PortainerScreen.tsx          # NAS 系统管理（Docker–Portainer）
│   ├── NasManagementScreen.tsx      # NAS 管理后端路由壳（unraid/portainer）
│   ├── SettingsScreen.tsx           # 设置
│   ├── JellyfinScreen.tsx
│   ├── NavidromeScreen.tsx
│   ├── AudiobookshelfScreen.tsx
│   ├── TalebookScreen.tsx
│   ├── QBitTorrentScreen.tsx
│   ├── OpenListScreen.tsx
│   ├── Aria2Screen.tsx
│   └── KomgaScreen.tsx
├── components/                      # ServiceHeader / ServiceDrawer / FullScreenModal 等共享组件
├── stores/
│   ├── appStore.ts                  # 全局：servers/services/theme/config/downloads
│   ├── jellyfinStore.ts / jellyfinPlaybackStore.ts
│   ├── navidromeStore.ts / navidromePlaybackStore.ts / navidromeLyricsStore.ts
│   ├── audiobookshelfStore.ts / audiobookshelfPlaybackStore.ts
│   ├── talebookStore.ts             # 含本地浏览历史（AsyncStorage, max 10 条）
│   ├── aria2Store.ts / qbittorrentStore.ts / openlistStore.ts
│   └── komgaStore.ts
└── lib/
    ├── api/
    │   ├── client.ts                # apiFetch / apiGraphQL / buildUrl 底层
    │   ├── filebrowser.ts / webdav.ts / fileManager.ts
    │   ├── unraid.ts                # GraphQL mutations（容器/VM）
    │   ├── unraidCapabilities.ts    # Introspection 探测 DockerMutations 能力
    │   ├── portainer.ts             # Portainer REST API（容器/端点）
    │   ├── jellyfin.ts / jellyfinCache.ts / jellyfinPlayback.ts
    │   ├── navidrome.ts / navidromeCache.ts
    │   ├── audiobookshelf.ts / talebook.ts / talebookCache.ts
    │   ├── aria2.ts / qbittorrent.ts / openlist.ts
    │   └── komga.ts / komgaCache.ts
    ├── android-intent.ts            # 跳 Immich / Talebook 官方 App
    ├── cryptoPolyfill.ts            # Hermes 下为 crypto-js 提供 getRandomValues（expo-crypto）
    ├── downloadManager.ts           # 原生 DownloadManager 封装
    └── theme.ts / constants.ts

android/app/src/main/java/com/unraiddash/app/
├── DownloadManagerModule.kt         # 原生下载模块
├── MainActivity.kt                  # AppTheme（处理 splash 衔接）
└── MainApplication.kt               # 模块注册
```

---

## 下一步计划

v1.0.0 beta 功能开发已完成，欢迎提出改进建议与新增服务页面的需求。

---

## 许可证

[MIT](./LICENSE)