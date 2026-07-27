# 下一步计划

> 本文档记录接下来要做的事项，按优先级排序。
> 最近更新：2026-07-27（FileBrowser P1 全部完成 ✅；音视频预览已完成；下一步：媒体服务器集成 或 主题颜色设置）

---

---

## 今日完成 (2026-07-27)

### FileBrowser P1 ⑨ 文件预览+编辑（文本/代码/图片/HTML/PDF）+ 音视频 ✅

- **新组件** `src/components/FilePreviewModal.tsx`
- **文本/代码文件** (.txt/.md/.json/.js/.py/.go/...) — `fetch` + `X-Encoding: true` 获取内容，`<ScrollView>` 只读预览，点「编辑」切换 `<TextInput multiline>`，`PUT` 保存
- **HTML 文件** — `react-native-webview` 加载 `/api/raw?inline=true`
- **图片** — `<Image>` 加载 `/api/raw?inline=true`
- **不可预览文件** — 仍走 action sheet（保持不变）
- 编辑态：header 显示「保存」按钮，有未保存更改时返回弹确认框
- 保存后自动刷新文件列表

#### 音视频预览（新增 ✅）
- **expo-video** (`VideoView` + `useVideoPlayer`) — 视频播放，支持全屏、画中画，Media3/ExoPlayer 后端
- **expo-audio** (`useAudioPlayer`) — 音频播放，自定义播放按钮 + 进度条 + 时间显示，Media3/ExoPlayer 后端
- **均支持 `headers` 参数** — `useVideoPlayer({ uri, headers: { 'X-Auth': token } })`，X-Auth 认证直接传
- **不依赖 FFmpeg** — 服务器负责转码，APK 无需增加 50~100MB

#### 新增 API（`filebrowser.ts`）
- `getFileContent()` — `GET /api/resources/{path}` + `X-Encoding: true`
- `saveFileContent()` — `PUT /api/resources/{path}` + body

#### 新工具函数
- `getFileCategory()` — 按扩展名返回 `text` / `image` / `html` / `pdf` / `video` / `audio` / `system` / `other`

#### GBK 编码修复
- `iconv-lite` + `buffer` polyfill 解决中文文件名乱码
- `decodeText()` 链：UTF-8 strict → iconv gbk → UTF-8 loose

#### PDF / Office 系统阅读器
- `expo-intent-launcher` + `startActivityAsync(ACTION_VIEW)`
- > 20MB 提示下载；< 20MB 下载到缓存 → `getContentUriAsync` → 系统 App 打开

#### 文件类型分类
- `'system'` 新分类：doc/docx/xls/xlsx/ppt/pptx
- `filePdf` 图标注册到 `Icon.tsx`

---

## 代码清理 (2026-07-26)

### JS / TS 死代码
- `crypto.ts` 仅保留 `generateId`（删 `encrypt` / `decrypt` / SHA256 + XOR 实现，因为不是真正的 AES-GCM）
- `appStore.ts` 删 `masterPassword` 字段、`setMasterPassword` action、`init(masterPassword?)` 的密码参数
- `unraid.ts` 删 `fetchSystemInfo`（从来没人调）和 `SYSTEM_INFO` 查询
- `theme.ts` 删 `useIsDark` hook 和 `export interface ThemeColors`（仅本文件用）
- `constants.ts` 删 `SERVICE_CATEGORIES`
- `client.ts` 删 `export` from `apiFetch`（仅 `apiGraphQL` 内部用）
- `downloadManager.ts` 删 `export` from `queryProgress`（仅 `pollTaskProgress` 内部用）
- `types/index.ts` 删 `export` from `TabAssignment`
- `FileScreen.tsx` 下载轮询 `useEffect` 重写：用 `downloadTasksRef` + `cancelled` 标记 + `Promise.all` + `Map` 合并，删 `pollRef` 空 ref
- `FileScreen.tsx` 横幅文案 `Download/mynas` → `Download/One NAS`
- `App.tsx` `useEffect(..., [])` → `useEffect(..., [init])`，删 `useState` / `useCallback` 未用 import

### Android 死资源 / 配置
- `AndroidManifest.xml` 删 `SYSTEM_ALERT_WINDOW` / `VIBRATE`
- `values/colors.xml` 删 `iconBackground`
- `drawable/ic_launcher_background.xml` 删（无引用）
- `app.json` 删 `ios` / `web` / `android.adaptiveIcon` / `plugins` / `icon`（项目是 Android-only，splash 走 values/styles.xml，不走 `expo prebuild`）

### assets/ 死文件
- 删 `adaptive-icon.png` / `android-icon-{background,foreground,monochrome}.png` / `favicon.png` / `icon.png` / `splash-icon.png` / `splash-icon-dark.png` / `gen-splash.js`（都没引用）
- 保留 `cbi--nas-v2.svg`（mipmap 资源源）和 `gen-splash-icons.js`（私有构建工具）

### 依赖
- 删 `expo-sharing`（没人 import）
- 删 `react-native-vector-icons`（没人 import）
- 保留 `react-native-webview`（文件预览用）
- 保留 `react-native-reanimated`（`react-native-draggable-flatlist` 依赖）
- 新增 `expo-video` + `expo-audio`（音视频预览，Media3/ExoPlayer）

---

## ⓪ FileBrowser 功能增强

**目标**：以 FileBrowser 网页端功能为基准，补齐文件管理核心能力。

**状态**：**P1 全部完成 ✅**

---

### P0 — 已完成 ✅

- [x] 登录认证（POST `/api/login`）
- [x] 列表浏览（`/api/resources`）
- [x] 目录创建（POST）
- [x] 删除 / 重命名 / 复制（DELETE / GET ?action=）
- [x] 上传（POST multipart）
- [x] 下载（`/api/raw` → Android `DownloadManager`）
- [x] 搜索（`/api/search`）
- [x] 多选 + 全选 + 批量操作
- [x] 列表 / 平铺视图切换
- [x] 排序
- [x] 切换目录自动回顶

---

### P1 — 已完成 ✅

#### ① 文件夹 zip 下载 ✅
- **API**：`GET /api/raw/{path}?format=zip`
- **RN**：操作菜单「打包下载」+ 多选「打包下载 (ZIP)」→ Android DownloadManager 后台下载，文件落地 `/storage/emulated/0/Download/One NAS/`

#### ② 文件类型图标 ✅
- 按扩展名分类（`image/`、`video/`、`audio/`、`text/`、`archive`、`code`、`document`、`book`）
- 8 个分类 SVG 图标注册到 `Icon.tsx`，`getFileIcon(filename)` 纯函数

#### ③ 文件预览 ✅（文本/代码/图片/HTML/PDF/音视频 全部完成）
| 类型 | 方案 | 状态 |
|------|------|------|
| **文本** (.txt/.md/.log) | `fetch` + `<ScrollView>` + `<Text>` | ✅ |
| **代码** (.js/.ts/.py/.go/) | 同上 + monospace 编辑 | ✅ |
| **JSON / XML / YAML** | 同上 | ✅ |
| **HTML** | `react-native-webview` | ✅ |
| **图片** | RN `<Image>` data URI（blob + FileReader） | ✅ |
| **PDF** | `expo-intent-launcher` 系统 App | ✅ |
| **Office** (doc/xls/ppt等) | `expo-intent-launcher` 系统 App | ✅ |
| **视频** | `expo-video` VideoView + Media3 | ✅ |
| **音频** | `expo-audio` useAudioPlayer + 自定义UI | ✅ |
| **电子书** | 暂不支持 | ❌ |

#### ④ 文件编辑 ✅ 文本/代码 已完成
- ✅ **API**：`GET /api/resources/{path}` → `content` → 编辑 → `PUT` 保存
- ✅ **UI**：全屏 `<TextInput multiline>` + 保存 / 取消按钮 + 未保存确认
- ❌ 大文件提示下载编辑（待后续）
- ❌ 语法高亮（待后续，需代码编辑器库）

#### ⑤ 分享功能 ✅
- **API**：`GET /api/shares` 列表、`POST /api/share/{path}` 创建（password / expires）、`DELETE /api/share/{hash}`
- **UI**：操作菜单「分享」→ 弹出配置（密码 / 过期）→ 自动复制链接
- **管理**：顶栏分享按钮 → 全屏分享管理（列表 / 删除 / 复制链接）

#### ⑥ 搜索修复 ✅
- **根因**：Go 服务器用 `r.URL.Path` 作为搜索根目录，原始 URL `/api/search?query=xxx` 无 scope，返回全部文件
- **修复**：URL 改为 `/api/search/{currentPath}?query=xxx`，根目录时 `/api/search/?query=xxx`
- **流式边搜边显**：`response.body.getReader()` 逐 chunk NDJSON 解析 + `onItem` 回调
- **停止 / 关闭**：搜索中「搜索」按钮切换为「停止」；关闭按钮停止+清+关；系统返回键搜索中只停止不关
- **结果缓存**：跳转后回来保留结果，搜索后台继续追加

#### ⑦ 系统 DownloadManager 后台下载 ✅
- 原生模块 + JS 封装 + 下载管理弹窗 + 权限修复

#### ⑧ 下载管理全屏 + 详情 Modal + 多选 ZIP 修复 + 进度轮询 ✅
- 下载按钮常驻、全屏管理页、全部清除
- 文件大小自动 B/KB/MB/GB 格式化
- 多选 ZIP 用 `?files=` 只打包选中文件
- 详情 Modal（名称/路径/大小/时间/分辨率/hash）
- 2s 进度轮询 + updateDownload

---

## ① NAS 管理修复

- [x] ContainerCard 状态大小写（RUNNING / EXITED / PAUSED）
- [ ] CPU / 内存显示为 0 — `DASHBOARD_QUERY` 删了 `info` / `metrics`，需要加回
- [ ] 字段映射待补：hostname、cpuModel、cpuCores、cpuThreads、memoryTotal/Used/Free/Percent、array.capacity、disks（temp/spinning）、vms（vcpus/memory）

---

## ② 下载管理中打开文件（用其他 App）

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

## ③ 主题颜色设置

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

## ④ 媒体服务器集成（规划中）

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

## 已完成的功能（仅作背景记录）

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
