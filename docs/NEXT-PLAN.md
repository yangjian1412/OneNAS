# 下一步计划

> 记录接下来要做的事项，按优先级排序。
> 最近更新：2026-08-03（按用户排期重新梳理开发计划）

---

## 阶段划分（按优先级从高到低）

> 原则：三轮迭代
> - **第一轮（当前）**：补齐未完成服务的页面
> - **第二轮**：新增服务 + 核心体验（导入导出 / 主题 / 开屏图标）
> - **第三轮（最后）**：已阶段完成服务的功能完善提升

---

## 第一轮：未完成服务的服务页面（优先）

目标：让设置里能选到的服务都至少有可用的页面，不再停留在 ServiceCard 占位。

### 1. aria2 / openlist / qbittorrent — 服务页面

当前状态：`ServiceType` / label / icon 已存在，但**没有专属 Screen**，进入后走 `ServiceScreen` fallback 的 ServiceCard（仅弹"在浏览器中打开"）。

| 服务 | 现状 | 需做 |
|------|------|------|
| **aria2** | icon 用通用 `downloadCloud`（无 SVG） | 补 SVG + Icon 路径 + 专属配置（host/port/RPC secret）+ 服务页 |
| **openlist** | 有 selfhst SVG | 专属配置 + 服务页 |
| **qbittorrent** | 有 selfhst SVG | 专属配置 + 服务页 |

深度待定（用户在本轮开始前确认）：
- **D-轻**：补 SVG/Icon/ConfigModal 专属字段，页面试探走 WebUI/浏览器
- **D-中**：每个加 WebView 内嵌页（注入认证）
- **D-重**：原生 API 集成 + UI（aria2 JSON-RPC / qb WebUI / openlist REST）

---

## 第二轮：新增服务 + 核心体验完善

按先后顺序：

### 1. WebDAV 文件管理协议（与 FileBrowser 并列）

**WebDAV 与 FileBrowser 是并列关系，不是子集**。两者都是"文件管理"后端协议，按用户配置二选一。

设计：
- **配置位置**：当前"文件管理的配置页面"（即 FileBrowser 服务器设置入口）。在该处提供切换选项：
  - **FileBrowser**（默认）— 现有行为完全不变
  - **WebDAV** — 切换后，tab1 文件管理页面的所有操作（浏览 / 上传 / 下载 / 新建 / 重命名 / 复制 / 移动 / 删除 / 预览 / 分享 / ZIP 下载 / 流式搜索）走 WebDAV 协议
- **协议细节**：
  - 认证：Basic（username + password）
  - URL：`https://host:port/dav` 或类似 base
  - 操作对应：
    - 列表：`PROPFIND`
    - 下载：`GET`
    - 上传：`PUT`
    - 新建文件夹：`MKCOL`
    - 删除：`DELETE`
    - 重命名 / 复制 / 移动：`MOVE` / `COPY`
- **实现位置**：
  - `src/lib/api/webdav.ts` — WebDAV 协议封装
  - `FileScreen.tsx` — 按当前"文件管理后端"配置路由到 FileBrowser 或 WebDAV 实现
  - `ConfigModal.tsx` — 在 FileBrowser / Unraid / WebDAV 间切换
  - 状态：tab1 全局统一使用 `fileBackend: 'filebrowser' | 'webdav'`（由设置页决定）

### 2. 新增 Emby 服务界面（与 Jellyfin 并列）

**Emby 和 Jellyfin 是并列关系**，两者 API 协议同源（都是 Jellyfin 派生 API），按用户配置独立选择。

设计：
- **独立服务栏**：有的用户用 Jellyfin 管理视频，有的用 Emby，有的两个都用。新增 Emby 服务栏，独立可选、可并存
- **复用 Jellyfin**：展示方式、播放器样式、组件、API 封装**完全复用 Jellyfin**（同源协议，仅替换 baseURL 与认证）
- **配置项可减**：Emby 服务端实际不需要 Jellyfin 的某些字段；按 Emby 实际可减（如 Emby 可能不需要的 Plugin / Feature 配置）
- **现状**：
  - ServiceType 增加 `emby`
  - `upload/selfhst--emby.svg` 需移入 `src/icos/` 并接入 Icon.tsx
  - `lib/api/jellyfin.ts` 抽象为可配置 baseURL（`jellyfin` 或 `emby`），或抽出 `mediaServerApi` 共享
  - `SERVICE_TYPE_LABELS` / `SERVICE_TYPE_ICONS` 增加 emby
- **用户场景**：
  - 仅 Jellyfin：与现状完全一致
  - 仅 Emby：使用 Emby 服务器，体验与 Jellyfin 一致
  - 同时启用：顶栏 / Tab2 / Tab3 各放一个

### 3. 导入导出完善

配置文件加密导出/导入两步流程已（SettingsScreen）——补齐收尾并确认 UI 稳定后，纳入正式功能。

### 4. 主题（Theme）完善

- 主色 / 强调色可定制
- 6-8 个预设色块（点击即用）
- 自定义：色板或十六进制输入
- 浅色 / 深色 / 跟随系统切换不影响主色

### 5. App 开屏画面（Splash）完善

优化原生 SplashScreen 与 JS SplashView 的衔接流畅度、文案/配色。

### 6. App 图标（Icon / Logo）完善

统一尺寸约定、跟随主题色、圆角规范；补齐 aria2 等缺失图标。

---

## 第三轮（最后）：已阶段完成服务的功能完善 / 提升

> 分批最后做，与"未完成项目的功能完善提升"合并一并处理。

- **filebrowser** / **jellyfin** / **navidrome** / **audiobookshelf** / **talebook** / **immich**（六个阶段性完成）的功能完善与体验提升
- 未完成项目的功能完善提升统一归入此轮

---

## 已完成功能（背景记录，供参考）

### 服务页面（阶段完成）
- FileBrowser 文件管理（P1 全部完成）：浏览/上传/下载/新建/重命名/复制/移动/删除、ZIP 下载、预览、编辑、分享、流式搜索、下载管理
- Jellyfin：季列表/剧集/详情、缓存优先、返回键、内嵌播放
- Navidrome：专辑/歌曲/播放器/歌词/后台播放
- Audiobookshelf：章节/书签/后台播放/下载（raw ADTS 限制见下）
- Talebook：服务页/书架/搜索/阅读（SafeBrowsing 处理）
- Immich（跳转官方 App）

### App 整体
- 服务设置、标签设置、主题切换（浅/深/系统）
- 配置文件 AES 加密导出 / 导入（含口令）
- 顶部固定服务栏
- Tab 图标选中态
- 原生 SplashScreen + Adaptive Icon

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
| Komga / Mihon | komga/、mihon/、mihon-extensions-source/ |