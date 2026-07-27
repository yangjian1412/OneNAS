# 下一步计划

> 本文档记录接下来要做的事项，按优先级排序。
> 最近更新：2026-07-28（Tab4 NAS 管理全面重构完成 ✅；FileBrowser P1 全部完成 ✅）

---

## 今日完成 (2026-07-28)

### Tab4 NAS 管理界面重构 ✅

- **全面重构** `src/screens/DockerScreen.tsx`：仪表盘 + 磁盘两行布局 + VM 管理 + 容器详情 + auto refresh
- **仪表盘**：CPU 环形进度（`CircularProgress` 组件）+ 内存环形进度 + 阵列环形进度（已用百分比）
- **磁盘两行布局**：
  - PARITY 盘：1 行（仅名称 + 温度 + 状态）
  - DATA/CACHE 盘：2 行（第 1 行名称 + 温度 + 状态；第 2 行容量进度条）
  - 温度圆圈 → 行内文字 "49°C"（紧凑化）
  - 进度条高度 4dp，padding 8dp，行间距 6dp
- **智能单位格式化** `formatSizeUnit(kb)`：每项独立选最直观单位（≥1TB→TB、≥1GB→GB、<1GB→MB）
- **Auto Refresh**：默认关闭，5 秒间隔，20 秒硬超时保护
- **VM 管理**：`vms.domain`（单数），显示 VM 名称 + 状态（RUNNING/STOPPED）
- **容器详情**：`fetchContainerDetail` 变量类型改为 `PrefixedID!`，移除不可用字段（ports/networks）
- **CPU 速度**：`info.cpu.speed` 显示在处理器行末尾
- **新组件**：`src/components/CircularProgress.tsx`（SVG 圆形进度）
- **参考源码文件夹** `ref-src/`：存放 FileBrowser 等参考项目源码，不参与构建

### 参考源码管理 ✅
- 创建 `ref-src/` 文件夹存放参考项目源码
- `filebrowser-src/` 和 `filebrowser-source.zip` 移入 `ref-src/`
- `.gitignore` 添加 `ref-src/`

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
