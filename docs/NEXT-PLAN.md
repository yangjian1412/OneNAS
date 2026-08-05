# 下一步计划

> 记录接下来要做的事项，按优先级排序。
> 最近更新：2026-08-05（基础开发完成，进入第三轮功能完善阶段）

---

## 阶段划分（按优先级从高到低）

> 原则：三轮迭代
> - **第一轮 + 第二轮**：**已完成** ✅
> - **第三轮（当前）**：已阶段完成服务的功能完善提升

---

## 第一轮 + 第二轮：已完成记录

### aria2 / openlist / qbittorrent — 服务页面 ✅

| 服务 | 已做 |
|------|------|
| **aria2** | ✅ Store + Screen + ConfigModal 字段 + 任务管理 + 全局选项 + 顶栏卡片 + 返回键处理 |
| **openlist** | ✅ Store + Screen + ConfigModal + 文件浏览 + 推 aria2 + 顶栏卡片 + 返回键处理 |
| **qbittorrent** | ✅ Store + Screen + ConfigModal + 任务管理 + 过滤 + 顶栏卡片 + 返回键处理 |

完成时间：2026-08-03 批次

### WebDAV 文件管理协议 ✅

- 与 FileBrowser 并列，Basic auth + PROPFIND/PUT/MKCOL/DELETE/MOVE/COPY
- 路径编码（RFC 3986）、UTF-8→Base64（Hermes 无 btoa）、目录尾斜杠修复（Apache 301→401）
- 完成时间：2026-08-04

### Emby 服务界面 ✅

- 独立 service type，复用 Jellyfin Store/Screen，缓存隔离（cacheNs）
- 完成时间：2026-08-03 批次

### 导入导出完善 ✅

- 配置文件 AES 加密导出/导入（SettingsScreen 两步流程）
- 完成时间：2026-08-02

### App 开屏画面（Splash）完善 ✅

- 纯原生 splash + 文字位图，移除 JS SplashView 减少 ~400ms 启动延迟
- 文字位置：底部约 1/4 区域（深蓝 `#1b3a8c` / 夜浅蓝 `#64b5f6`）
- 完成时间：2026-08-04

### ServiceBar 横向自由滚动 ✅

- 去除"最多 4 个"限制，改为横向 ScrollView 自由滚动
- 完成时间：2026-08-05（56980f2）

### 仍待办（轻量）

- **主题颜色自定义**：主色/强调色可定制，预设色块 + 十六进制输入
- **aria2 专用 SVG 图标**：当前仍用通用 `downloadCloud`
- **3 个服务 WebView 内嵌页**（注入认证）：aria2/qbittorrent/openlist

---

## 第三轮（当前）：已阶段完成服务的功能完善 / 提升

按优先级从高到低：

1. **主题颜色自定义** — 主色/强调色可定制，预设色块 + 十六进制输入
2. **aria2 专用 SVG 图标** — 当前仍用通用 `downloadCloud`
3. **3 个服务 WebView 内嵌页**（注入认证）— aria2 / qbittorrent / openlist
4. **filebrowser / jellyfin / emby / navidrome / audiobookshelf / talebook / immich / aria2 / qbittorrent / openlist**（十个服务）功能完善与体验提升

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
- 顶部固定服务栏（横向自由滚动，无数量限制）
- Tab 图标选中态
- **原生 SplashScreen + Adaptive Icon + "One NAS" 文字位图**
- Unraid docker 操作兼容 4.32+（introspection 探测）
- **ServiceBar 横向自由滚动**（2026-08-05，去除最多 4 个限制）

### 已修复 Bug

- 服务页返回键无法退出（aria2/qbittorrent/openlist/audiobookshelf）
- Jellyfin/Emby 缓存串味（共享 cache key）
- Talebook "最近浏览" 一直为空（服务端无该端点，改本地 AsyncStorage）
- Unraid docker startContainer/stopContainer/restartContainer 400（字段名错，4.32+ 用 start/stop/restart）
- WebDAV 子目录 401（Apache 301→http 降级丢 Authorization，补尾斜杠修复）
- WebDAV 文件夹误判为文件（PROPFIND 需显式 body 含 `<D:resourcetype>`）

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