# 下一步计划

> 记录接下来要做的事项，按优先级排序。
> 最近更新：2026-08-04（更新 OpenList/qB/Aria2/Unraid docker mutation 修复、原生 splash 文字、WebDAV 等阶段性完成项）

---

## 阶段划分（按优先级从高到低）

> 原则：三轮迭代
> - **第一轮（当前）**：补齐未完成服务的页面
> - **第二轮**：新增服务 + 核心体验（导入导出 / 主题 / 开屏图标）
> - **第三轮（最后）**：已阶段完成服务的功能完善提升

---

## 第一轮：未完成服务的服务页面（优先）

目标：让设置里能选到的服务都至少有可用的页面，不再停留在 ServiceCard 占位。

### 1. aria2 / openlist / qbittorrent — 服务页面 ✅ 已完成基础

当前状态：**已完成专属 Screen + Store + 配置 + 顶栏卡片**，剩余深度完善归入第三轮。

| 服务 | 现状 | 已做 |
|------|------|------|
| **aria2** | icon 用通用 `downloadCloud`（无 SVG） | ✅ Store + Screen + ConfigModal 字段 + 任务管理 + 全局选项 + 顶栏卡片 + 返回键处理 |
| **openlist** | 有 selfhst SVG | ✅ Store + Screen + ConfigModal + 文件浏览 + 推 aria2 + 顶栏卡片 + 返回键处理 |
| **qbittorrent** | 有 selfhst SVG | ✅ Store + Screen + ConfigModal + 任务管理 + 过滤 + 顶栏卡片 + 返回键处理 |

完成时间：2026-08-03 批次

**仍待办（轻量）：** 补齐 aria2 专用 SVG / Icon 路径；3 个服务 WebView 内嵌页（注入认证）。

---

## 第二轮：新增服务 + 核心体验完善

按先后顺序：

### 1. WebDAV 文件管理协议（与 FileBrowser 并列）✅ 已完成

WebDAV 与 FileBrowser 是并列关系（不是子集），两者都是"文件管理"后端协议。

- **配置位置**：FileBrowser 服务器设置入口 → 切换 FileBrowser / WebDAV
- **实现位置**：
  - `src/lib/api/webdav.ts` — WebDAV 协议封装（PROPFIND/PUT/MKCOL/DELETE/MOVE/COPY）
  - `src/lib/api/fileManager.ts` — 后端路由
  - `FileScreen.tsx` — 按 `fileBackend` 路由到不同实现
  - `ConfigModal.tsx` / `SettingsScreen.tsx` — 切换 UI
- **状态字段**：`appStore.fileBackend: 'filebrowser' | 'webdav'` + `webdavServer`
- **注意事项**（详见 `src/lib/api/webdav.ts`）：
  - UTF-8 → Base64 自实现（Hermes 无 `btoa`）
  - PROPFIND XML 兼容命名空间前缀 (`<D:href>`)
  - 所有 API 入参用相对路径

完成时间：2026-08-04

### 2. 新增 Emby 服务界面（与 Jellyfin 并列）✅ 已完成

- `ServiceType` 增加 `emby`
- `lib/api/jellyfin.ts` 抽象为可配置 baseURL（`jellyfin` 或 `emby`）
- Store 增加 `serviceId` + `resetForService(serviceId)`，缓存 key 加 `service.id` 前缀（避免 Jellyfin/Emby 串味）
- JellyfinItemDetail 接受 `cacheNs` prop
- `screens/JellyfinScreen.tsx` loadServer 切服务时先 reset

完成时间：2026-08-03 批次

### 3. 导入导出完善 ✅ 已完成

- 配置文件 AES 加密导出/导入（SettingsScreen 两步流程）
- 完成时间：2026-08-02

### 4. 主题（Theme）完善

- 主色 / 强调色可定制
- 6-8 个预设色块（点击即用）
- 自定义：色板或十六进制输入
- 浅色 / 深色 / 跟随系统切换不影响主色

### 5. App 开屏画面（Splash）完善 ✅ 已完成（2026-08-04）

- 改用**纯原生 splash + 文字位图**，移除 JS SplashView 减少 ~400ms 启动延迟
- Android 12+ 系统 splash 用 `splash_empty.xml`（透明 shape）→ 阶段1 纯底色
- 窗口背景用 `splash_window.xml`（layer-list：底色 + "One NAS" 位图 340×113dp）→ 阶段2 正常比例
- 文字位置：底部约 1/4 区域（避免居中显得偏高）
- 文字色：深蓝 `#1b3a8c` / `drawable-night` 浅蓝 `#64b5f6`

### 6. App 图标（Icon / Logo）完善

- 统一尺寸约定、跟随主题色、圆角规范
- 补齐 aria2 等缺失图标

---

## 第三轮（最后）：已阶段完成服务的功能完善 / 提升

> 分批最后做，与"未完成项目的功能完善提升"合并一并处理。

- **filebrowser** / **jellyfin** / **emby** / **navidrome** / **audiobookshelf** / **talebook** / **immich** / **aria2** / **qbittorrent** / **openlist**（十个阶段性完成）的功能完善与体验提升
- **Unraid docker 管理兼容性**（已完成）：introspection 探测 server capabilities，兼容 4.32-4.34 → 4.35+
- 未完成项目的功能完善提升统一归入此轮

---

## 已完成功能（背景记录，供参考）

### 服务页面（阶段完成）

- **FileBrowser**：浏览/上传/下载/新建/重命名/复制/移动/删除、ZIP 下载、预览、编辑、分享、流式搜索、下载管理
- **WebDAV**：浏览/上传/下载/新建/重命名/复制/移动/删除、ZIP 下载、预览（HTML 源码视图）、GBK 编码、Basic auth
- **Jellyfin**：季列表/剧集/详情、缓存优先（5min/30s）、返回键、内嵌播放
- **Emby**：复用 Jellyfin，独立 service type 与隔离缓存
- **Navidrome**：专辑/歌曲/播放器/歌词/后台播放
- **Audiobookshelf**：章节/书签/后台播放（raw ADTS 章节精确 seek 受限，登记暂搁）
- **Talebook**：服务页/书架/搜索/阅读（SafeBrowsing 处理）/ 本地浏览历史（AsyncStorage, max 10）
- **aria2 / qBittorrent / OpenList**：任务管理 + 顶栏卡片 + 返回键
- **Immich**（跳转官方 App）

### App 整体

- 服务设置、标签设置、主题切换（浅/深/系统）
- 配置文件 AES 加密导出 / 导入（含口令）
- 顶部固定服务栏（最多 4 个，支持内嵌卡片 + 跳转 App）
- Tab 图标选中态
- **原生 SplashScreen + Adaptive Icon + "One NAS" 文字位图**
- Unraid docker 操作兼容 4.32+（introspection 探测）

### 已修复 Bug

- 服务页返回键无法退出（aria2/qbittorrent/openlist/audiobookshelf）
- Jellyfin/Emby 缓存串味（共享 cache key）
- Talebook "最近浏览" 一直为空（服务端无该端点，改本地 AsyncStorage）
- Unraid docker startContainer/stopContainer/restartContainer 400（字段名错，4.32+ 用 start/stop/restart）

---

## 待解决 / 已登记（暂搁）

### Audiobookshelf：raw ADTS AAC 章节内无法精确跳转进度

**登记时间**：2026-08-02
**优先级**：低（暂搁）

- 某书第 46–66 章（21 个文件）为 `raw ADTS AAC`（720P AVC MP4 抽出的裸 AAC，无容器/无 seektable）
- 客户端（本 App + 官方 Web）**物理层面无法精确 seek**
- 唯一真正解决路径：服务端 ffmpeg 重封装 `.aac` → `.m4a`（-c:a copy -movflags +faststart），重扫后即可精确 seek
- 客户端妥协备选（未实施）：raw 轨道拖动改为跨章 / 关闭 10s 节流 / 首进弹 Toast
- 用户已确认真正的跳转体验暂不动

---

## 参考源码目录（ref-src/）

`docs/../ref-src/`（同项目根 `ref-src/`，不参与构建/上传 git）存放参考项目源码：

```
ref-src/
├── alist/  aria2/  audiobookshelf-app/  audiobookshelf-server/
├── dsub/  filebrowser-src/  findroid/
├── jellyfin-android/  jellyfin-androidtv/  jellyfin-docs/  jellyfin-server/
├── komga/  mihon/  mihon-extensions-source/  openlist-app/
├── qbittorrent/  tempo-gai/
```

| 服务 | 参考 |
|------|------|
| Jellyfin | findroid/、jellyfin-server/Controllers/ |
| Navidrome | dsub/、tempo-gai/ |
| Audiobookshelf | audiobookshelf-app/、audiobookshelf-server/ |
| aria2 | aria2/src/ |
| AList/OpenList | alist/、openlist-app/ |
| qBittorrent | qbittorrent/src/webui/ |