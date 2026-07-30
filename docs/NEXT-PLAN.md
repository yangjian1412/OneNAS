# 下一步计划

> 本文档记录接下来要做的事项，按优先级排序。
> 最近更新：2026-07-30（Navidrome 大修启动）

---

## Navidrome 修复顺序 (2026-07-30)

按依赖顺序排列：

### 1. API 层 — `src/lib/api/navidrome.ts`
检查每个 Subsonic 端点解析是否正确、返回值类型匹配

### 2. 类型定义 — `src/types/index.ts`
确保 `NavidromeAlbum`, `NavidromeSong`, `NavidromePlaylist` 等字段与 Navidrome 实际返回一致

### 3. Store — `src/stores/navidromeStore.ts`, `navidromePlaybackStore.ts`
数据流和状态管理，`loadNavidromeHome` 取哪些端点数据

### 4. 主页 — `src/screens/NavidromeScreen.tsx`
各 View 切换、loading/error、数据传入、分节渲染

### 5. 设置 — `src/components/navidrome/NavidromeSettings.tsx`
歌词/常用设置的 UI 和交互逻辑

### 6. 播放器 — `src/components/navidrome/NavidromePlayer.tsx`
内嵌播放器、底部 Bar、scrobble

### 7. 数据格 — `NavidromeAlbumGrid`, `ArtistGrid`, `PlaylistGrid`, `SongList`
列表/网格显示

### 8. 侧边栏/顶栏 — `NavidromeDrawer`, `NavidromeHeader`, `NavidromeCoverArt`
纯 UI 收尾

---

## 今日完成 (2026-07-29)

### Jellyfin 季列表 + 返回键 bug 修复 ✅

- **季列表只显示特别篇**
  - 根因：`/Shows/{id}/Seasons` 端点传了 `isSpecialSeason=true`，服务端只返回 `IndexNumber=0` 的特别篇
  - 修复：`src/lib/api/jellyfin.ts:199` 去掉 `&isSpecialSeason=true`，`src/types/index.ts` 给 `JellyfinSeason` 加 `IndexNumber` 字段

- **Tab1 顶栏入口返回键失效（每层一次都跳 Tab1）**
  - 根因：`FileScreen.tsx` 把 `JellyfinScreen` 包在 `<Modal>` 里，Modal 在原生层注册 BackHandler 拦截了 JellyfinScreen 自己的 JS handler
  - 修复：用 `ActiveServiceView`（`Animated.View` 条件渲染 + 滑入动画）替换 Modal；`JellyfinScreen` 新增 `onRequestClose` prop；`FileScreen` 的 onBack 在 activeService 时直接 return false 让 JellyfinScreen 处理

---

## 今日完成 (2026-07-28)

### Tab4 NAS 管理界面重构 ✅

- **全面重构** `src/screens/DockerScreen.tsx`：仪表盘 + 磁盘两行布局 + VM 管理 + 容器详情 + auto refresh
- **仪表盘**：CPU 环形进度（`CircularProgress` 组件）+ 内存环形进度 + 阵列环形进度（已用百分比）
- **磁盘两行布局**：PARITY 1 行 / DATA/CACHE 2 行，温度圆圈→行内文字，紧凑化
- **智能单位格式化**：`formatSizeUnit(kb)` 每项独立选 TB/GB/MB
- **Auto Refresh**：默认关闭，5 秒间隔，20 秒硬超时保护
- **新组件**：`CircularProgress.tsx`（SVG 圆形进度）

### 参考源码下载 ✅

- 创建 `ref-src/` 文件夹，存放 17 个参考项目源码（共 ~370 MB）
- `.gitignore` 添加 `ref-src/`，不参与 git 备份
-详见下方「参考源码目录」章节

---

## 功能完成状态

### FileBrowser P1 — 全部完成 ✅

| 功能 | 状态 |
|------|------|
| 登录认证 / 列表浏览 / 新建 / 删除 / 重命名 / 复制 / 移动 / 上传 / 下载 | ✅ |
| 文件夹 ZIP 下载 | ✅ |
| 文件类型图标（8 类） | ✅ |
| 文件预览（文本/代码/JSON/HTML/图片/PDF/Office/视频/音频） | ✅ |
| 文件编辑（文本/代码） | ✅ |
| 分享功能 | ✅ |
| 流式搜索（NDJSON + scope） | ✅ |
| 系统 DownloadManager 后台下载 + 下载管理 | ✅ |

### Tab4 NAS 管理 — 全部完成 ✅

| 功能 | 状态 |
|------|------|
| 系统资源概览（CPU / 内存 / 阵列） | ✅ |
| 仪表盘环形进度 | ✅ |
| 磁盘列表（紧凑两行布局 + 智能单位） | ✅ |
| Docker 容器列表（启动/停止/重启） | ✅ |
| 容器详情 Modal | ✅ |
| VM 列表 | ✅ |
| Auto Refresh（5 秒间隔，20 秒超时） | ✅ |

---

## 当前问题（2026-07-28）— 优先修复

### 1. 季列表只显示特别篇

**表现**：季列表只展示了 `IndexNumber=0` 的 Season（特别篇），第 1 季、第 2 季等正常季不显示。

**疑因**：
- `/Seasons` 端点传了 `isSpecialSeason=true` 参数，可能限制了仅返回特别篇
- 或 `filter(s => s.Type === 'Season')` 过滤掉了无 Type 字段的正常季

**待检查**：
- `jellyfinGetSeasons` 中的 API 参数与过滤条件
- 是否需要去掉 `isSpecialSeason` 参数改用 `IncludeItemTypes=Season`
- 确认服务端返回数据结构

### 2. 返回键始终回到 Tab1

**表现**：无论当前在哪个层级（详情页、季列表、剧集列表），按返回键都直接跳到 Tab1（文件），没有逐层返回。

**疑因**：
- `handleHardwareBack` 中 `viewRef.current` 取值可能是 stale closure
- `goBack` 函数未被正确调用
- TabNavigator `backBehavior="none"` 生效了但 JellyfinScreen 自己的 BackHandler 没拦截住

**待检查**：
- 确认 `BackHandler.addEventListener` 的返回事件是否被 JellyfinScreen 消费
- 检查 `view` 状态机中的 `goBack` 实现
- 可能需要在 ServiceScreen 层也注册 BackHandler，优先给 JellyfinScreen 消费

---

## 待开发功能（按优先级）

### ② 下载管理中打开文件

**目标**：在下载管理页面，下载完成的任务点击后调用系统 Intent，用对应的 App 打开文件（Office / PDF / 图片等）。

**现状**：
- `DownloadTask.progress.uri` 已返回 `file:///storage/emulated/0/Download/One%20NAS/<filename>`
- 目前只有「取消」和「移除」，无「打开」按钮

**方案**：
1. **expo-file-system**（已装）+ `Linking.openURL()` — 最简，无需新依赖
   - 先 `FileSystem.getContentUriAsync(fileUri)` 转成 `content://` URI
   - 再 `Linking.openURL(contentUri)` 调起系统选择器
2. 或装 `expo-sharing` / `react-native-share`（需额外依赖）

**实现位置**：
- `FileScreen.tsx` — DownloadManage modal，下载完成的 item 加「打开」按钮
- `src/lib/downloadManager.ts` — 可新增 `openDownloadedFile(uri)` JS 封装

**验收标准**：
- 点击已完成任务的「打开」按钮，系统弹出可用 App 列表
- PDF / Office / 图片 均能正确调起对应应用

---

### ③ 主题颜色设置

**目标**：现在只有浅色 / 深色 / 跟随系统三档，希望扩展：
1. **主色调（Primary Color）**：影响按钮、激活态、Switch 颜色
2. **强调色**：可选，作为辅助 hover / 选中态
3. **预留主题色板**：内置几套预设色

### 现状
- `src/lib/theme.ts` 定义了固定的 light / dark 两套调色板
- `useTheme()` 返回当前主题色

### 计划
1. 抽离颜色常量 → `src/lib/theme.ts` 中按结构分模块
2. 增加 `theme.colorPrimary: string` 等
3. 在 store 中保存：
   - `colorMode: 'preset' | 'custom'`
   - `colorPrimary: string` (默认 `#2563eb` / `#60a5fa`)
4. 设置页"主题"卡片下增加：
   - 主色选择器：6-8 个预设色块（点击即用）
   - 自定义：长按打开色彩选择弹窗（或者直接调系统色板输入十六进制）
5. 应用范围：按钮颜色、Switch 轨道、选中态、底部工具栏选中态
6. 浅色 / 深色依然存在，但 **不会** 让用户每个模式都选主色（避免复杂度），采用：跟随主色自动生成 dark 模式下的略浅一档主色

### 实现位置
- 重构：`src/lib/theme.ts`
- 新增组件：`src/components/ColorPicker.tsx`
- 拓展：`src/screens/SettingsScreen.tsx`，主题卡片下增加主色选择

### 验收标准
- 默认主色不变，所有用户可见。
- 用户选了主色后，按钮、Switch、选中态立即变化并持久化。
- 浅色 / 深色 / 跟随系统 切换不影响主色。

---

### ④ 媒体服务器集成（规划中）

**目标**：在 One NAS 内直接浏览 + 播放 Jellyfin / Navidrome / Audiobookshelf / Emby 媒体库。

### 现状
- 首页已有服务入口（jellyfin / navidrome / audiobookshelf / immich / calibre / qbittorrent）
- 目前只支持跳转到原生 App（Immich）或内嵌 WebView（其他）

### 规划

#### Jellyfin / Emby（视频）
- **API**：Jellyfin/Emby REST API (`/Users/{userId}/Items?parentId={id}`)
- **UI**：类似 FileScreen 的目录树浏览 → 点击视频调用 `expo-video` 直接播放（带 X-Auth-Token header）
- **优势**：无需转码，Media3 直接播放原始文件

#### Navidrome / Audiobookshelf（音频）
- **API**：Navidrome Subsonic API (`/rest/getMusicFolders` / `/rest/getAlbumList` 等)
- **UI**：专辑列表 → 点击播放 `expo-audio`
- **挑战**：Subsonic API 签名（salt + hash）

### 实施路径
1. 新增 `src/lib/api/mediaServer.ts` — 抽象媒体服务器接口
2. 新增 `src/screens/MediaServerScreen.tsx` — 通用媒体浏览 UI
3. 或直接在 ServiceScreen 中扩展卡片
4. 利用 `expo-video` / `expo-audio` 的 `headers` 参数传认证

---

## 已完成功能（背景记录）

### App 整体
- 服务设置：文件管理 / NAS 管理 + 长按排序的服务列表
- 标签设置：标签2 / 标签3 服务选择 + NAS 系统管理 显示 / 隐藏
- 主题切换：浅色 / 深色 / 跟随系统
- 导入 / 导出：底部 Sheet 操作
- 顶部固定服务栏（最多 4 个，溢出弹"更多"）
- Immich 直接跳转官方 App（未装时跳 Google Play）
- AES-GCM 加密 + 主密码（保留兼容性，但 UI 已隐去入口）
- Tab 图标选中态色条（深蓝 `#1b3a8c` → 用 `t.primary`）
- ServiceBar 顶部空白消除（paddingTop 28 → 2）
- 文件管理 Smart back（再按一次退出）
- 路径行点击弹面包屑 Sheet
- 顶栏标题居中 + 搜索展开 / 收起流畅切换
- 视图切换图标换为更好识别的 list-squares / squares-four
- 多选态加入「全选」按钮
- FileScreen 顶部布局 paddingTop: 96（ServiceBar absolute 不被覆盖）
- 崩溃修复：TabNavigator 缺 View import、ServiceBar 残留 SB_TOP 引用
- 原生 SplashScreen（`expo-splash-screen` + Theme.SplashScreen）：白底深字 / 深底浅字 "One NAS"，无拉伸
- 原生 Adaptive Icon：mipmap 全密度 .webp + 自动形状遮罩

### FileBrowser
- 列表 / 平铺 + 多选 + 批量 + 系统返回智能返回
- 文件排序（名称 / 大小 / 时间 + 升 / 降序持久化）
- 系统 DownloadManager 后台下载 + 下载管理弹窗
- 精确权限检测 + 深链到"所有文件访问权限"
- 文件类型图标（8 类）
- 文件夹 zip 下载
- 分享：创建 / 列表 / 删除 + 复制链接
- 切换目录自动回顶
- **流式搜索**：NDJSON streaming + scope 按目录搜索 + 停止/关闭/返回键逻辑 + 结果缓存 + Modal 统一关闭
- **文件预览**：文本 / 代码 / JSON / HTML / 图片 / PDF / Office / 视频 / 音频
- **GBK 编码修复**：中文文件名乱码解决

### NAS 管理（Tab4）
- 连接 Unraid GraphQL API
- Docker 容器列表（启动 / 停止 / 重启）+ 详情 Modal
- 系统资源仪表盘（CPU / 内存 / 阵列环形进度）
- 磁盘列表（紧凑两行布局 + 智能单位格式化）
- VM 列表（名称 + 状态）
- Auto Refresh（5 秒间隔，20 秒硬超时保护）

### App 标识 / 视觉
- App 名：One NAS
- 自适应图标（白底 / 深底 + 深蓝机架，启动器自动套形状）
- 开屏画面（白底 / 深底 + "One NAS" 蓝色字，无拉伸）
- 原生 SplashScreen 续命到主屏渲染

---

## 待确认 / 后续补充

### 统一 UI 标准 & Logo

**现状**：
- 头部 / 工具栏 / 操作栏图标已统一为 `src/icos/` 下的 SVG（`@expo/vector-icons` 风格）
- 服务 logo：filebrowser / jellyfin / navidrome / audiobookshelf / immich / calibre / qbittorrent / openlist / unraid（彩色，来自 selfhst / catppuccin 风格）
- 文件 / 文件夹图标：按扩展名分类的 SVG（8 类）+ `glyphs-poly--folder` / `glyphs-poly--folder-1` 文件夹

**目标**：
1. 进一步抽象：
   - 尺寸约定：列表 24dp / 平铺 28dp / header 24dp / 工具栏 22dp
2. 颜色：所有图标跟随主题色，禁用用 `t.textMuted`
3. 圆角：图标按钮全部使用 8dp 圆角（与现有保持一致）

---

## 参考源码目录（ref-src/）

本文档同目录下的 `ref-src/` 文件夹存放各服务的参考源码，不参与构建，不上传 git。

### 目录结构

```
ref-src/
├── alist/                    3.6 MB  — AList 服务端（Go + Gin，多存储支持）
├── aria2/                   11.3 MB  — aria2 源码（JSON-RPC 接口定义）
├── audiobookshelf-app/       11.6 MB  — Audiobookshelf 客户端（Vue）
├── audiobookshelf-server/     13.7 MB  — Audiobookshelf 服务端（Node.js）
├── dsub/                     4.3 MB  — DSub Subsonic 播放器（daneren2005/Subsonic）
├── filebrowser-src/          12.5 MB  — FileBrowser 源码
├── findroid/                32.2 MB  — Jellyfin 原生 Android 客户端（Media3）
├── jellyfin-android/         3.8 MB  — Jellyfin 官方 Android（WebView 包装）
├── jellyfin-androidtv/       1.6 MB  — Jellyfin Android TV（含原生播放）
├── jellyfin-docs/            8.5 MB  — Jellyfin 官方文档
├── jellyfin-server/          1.0 MB  — Jellyfin 服务端 Controller 层
├── komga/                  87.5 MB  — Komga 服务端（Kotlin/Spring，含 komga-webui）
├── mihon/                  18.2 MB  — Mihon manga 阅读器（Android）
├── mihon-extensions-source/ 73.1 MB  — Mihon 插件源码（含 Komga 插件）
├── openlist-app/            5.8 MB  — OpenList 跨平台客户端（Dart/Flutter）
├── qbittorrent/            60.7 MB  — qBittorrent C++ 源码
└── tempo-gai/             26.8 MB  — 魔改 tempo 播放器（你的个人项目）
```

### 参考重点

| 服务 | 参考内容 |
|------|----------|
| **Jellyfin** | `findroid/` — Media3 原生播放；`jellyfin-server/Controllers/` — API 路由 |
| **Navidrome/Subsonic** | `dsub/` — Subsonic API 调用（salt/token 认证）；`tempo-gai/` — 你的实现 |
| **Audiobookshelf** | `audiobookshelf-app/` — Vue 客户端；`audiobookshelf-server/server/api/` — REST API |
| **aria2** | `aria2/src/` — JSON-RPC 协议定义 |
| **AList/OpenList** | `alist/` — 服务端 API；`openlist-app/` — Flutter 客户端 |
| **qBittorrent** | `qbittorrent/src/webui/` — WebUI API 路由（认证、torrent 管理） |
| **Komga** | `komga/komga/` — REST API；`komga-webui/` — Web 阅读器；`mihon-extensions-source/src/` — Komga 插件 |
| **Mihon** | `mihon/` — Android manga 阅读器架构；插件在 `mihon-extensions-source/src/` |
