# 下一步计划

> 本文档记录接下来要做的事项，按优先级排序。
> 最近更新：2026-07-27（FileBrowser P1 ⑨ 文件预览+编辑（文本/代码/图片/HTML）；待开发：P1 ③ 音视频、NAS CPU/内存）

---

---

## 今日完成 (2026-07-27)

### FileBrowser P1 ⑨ 文件预览+编辑（文本/代码/图片/HTML）

- **新组件** `src/components/FilePreviewModal.tsx`
- **文本/代码文件** (.txt/.md/.json/.js/.py/.go/...) — `fetch` + `X-Encoding: true` 获取内容，`<ScrollView>` 只读预览，点「编辑」切换 `<TextInput multiline>`，`PUT` 保存
- **HTML 文件** — `react-native-webview` 加载 `/api/raw?inline=true`
- **图片** — `<Image>` 加载 `/api/raw?inline=true`
- **不可预览文件** — 仍走 action sheet（保持不变）
- 编辑态：header 显示「保存」按钮，有未保存更改时返回弹确认框
- 保存后自动刷新文件列表

#### 新增 API（`filebrowser.ts`）
- `getFileContent()` — `GET /api/resources/{path}` + `X-Encoding: true`
- `saveFileContent()` — `PUT /api/resources/{path}` + body

#### 新工具函数
- `getFileCategory()` — 按扩展名返回 `text` / `image` / `html` / `other`

### FileBrowser P1 ⑧ 下载管理全屏 + 详情 Modal + 多选 ZIP 修复 + 进度轮询

#### 下载管理全屏页面
- **下载按钮常驻** — 工具栏始终显示，不再仅限活跃任务
- **全屏 Modal** — 从透明底部 Sheet 改为 `animationType="slide"` 全屏页，与搜索/分享管理统一
- **全部清除** — ModalHeader 新增红色「全部清除」按钮，一键取消+移除所有下载任务
- **下载进度轮询** — `useEffect` 每 2s 调用 `pollTaskProgress` + `updateDownload` 实时更新 UI

#### 文件大小格式化
- **`formatFileSize()`** — 自动 B/KB/MB/GB/TB 显示，替换硬编码的 `(size/1024).toFixed(1) + " KB"`
- 文件列表 + 搜索结果统一使用

#### 多选 ZIP 只打包选中文件
- **`commonParent()`** — 计算选中文件的公共父目录
- **`?files=relPath1,relPath2`** — 传给服务端 `parseQueryFiles`，不再下载整个文件夹
- 服务端无需修改

#### 详细信息 Modal（P1 新功能）
- Action sheet 新增"详细信息"（在移动到...和删除之间）
- 展示：名称、路径、大小、修改时间
- 文件夹：文件数量、文件夹数量
- 图片：分辨率
- 文件：MD5 / SHA1 / SHA256 / SHA512 点击计算显示 hash
- **`getResourceInfo()`** — `GET /api/resources/{path}` 获取完整资源数据
- **`getFileChecksum()`** — `GET /api/resources/{path}?checksum={algo}` 获取 hash

#### 技术债务
- **`coerceAtLeast(0)` 移除** — `DownloadManagerModule.kt` 中 `contentLengthLong` 保留原始值
- **`appStore.ts`** — 新增 `clearDownloads()` action
- **`filebrowser.ts`** — 新增 `getResourceInfo()`、`getFileChecksum()`、`ResourceInfo` 接口
- **`FileScreen.tsx`** — 新增 `commonParent()`、`formatFileSize()`、`formatDateTime()`、`DetailsChecksums` 组件

### FileBrowser P1 ⑥ 流式搜索 (Streaming Search)
- **`searchFilesStream`** — 新增 NDJSON/JSON array 自动检测响应格式
- **搜索 scope 修复** — Go 服务器用 `r.URL.Path` 作为搜索根目录，URL 改为 `/api/search/{curPath}?query=...`（根目录时 `/api/search/?query=...`），解决返回全部文件的问题
- **Generation ID 防污染** — `searchGenerationRef` 防止旧 stream 数据污染新搜索
- **边搜边显** — 搜索中结果 FlatList 可见可交互，不再是纯 spinner
- **结果缓存** — 跳转后回来结果保留，搜索后台继续
- **停止按钮** — 搜索中「搜索」按钮切换为「停止」，支持中断搜索保留结果
- **系统返回键** — 搜索中只停止不关 Modal，不在搜索时才关闭清结果

### UI 一致性
- **分享管理** — 左上角返回箭头改为右上角「关闭」，与搜索/创建分享 Modal header 统一
- **Modal 标题右对齐** — 所有使用 Modal 的页面 header 统一为左标题 + 右关闭

### 技术债务
- `filebrowser.ts`: `parseLine` 严格化（过滤 null/无 path/非对象行），`scope` 参数传递搜索根目录
- `FileScreen.tsx`: `stopSearch`、`doSearch` finally 块、搜索按钮条件渲染、`onRequestClose` 条件逻辑
- **新增原生模块**：`android/.../DownloadManagerModule.kt` + `DownloadManagerPackage.kt`
  - `enqueueDownload(url, fileName, authToken)` — `DownloadManager.enqueue` + `addRequestHeader("X-Auth")` + `setDestinationInExternalPublicDir(Downloads, "One NAS/$fileName")`
  - `queryProgress(downloadId)` — `{bytesDownloaded, totalBytes, status, uri}`
  - `cancelDownload` / `removeDownload`
  - `isExternalStorageManager()` — `Environment.isExternalStorageManager()` 精确检测（替代 `Directory.create()` 试探法）
  - `openAllFilesAccessSettings()` — `Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION` 直接深链（替代 `Linking.openSettings()` 普通权限页）
- **JS 封装**：`src/lib/downloadManager.ts` — `enqueueDownload` / `queryProgress` / `cancelDownload` / `removeDownload` / `checkStoragePermission` / `openAllFilesSettings` / `pollTaskProgress`
- **`src/types/index.ts`**：新增 `DownloadTask`、`DownloadProgress` 类型
- **`src/lib/api/filebrowser.ts`**：删除 `downloadResource` / `downloadFolder` / `ensureExternalDir` / `checkExternalStorageAccess` / `EXTERNAL_DOWNLOAD_DIR`（不再用 `expo-file-system` 下载）
- **`FileScreen.tsx`**：
  - 单文件 / 文件夹 / 多选下载全部改用 `enqueueDownload`
  - 启动时 + 从设置切回时调用 `checkStoragePermission`
  - 失败时弹"去设置"对话框 → 调用 `openAllFilesSettings()`
  - Toolbar 加下箭头入口（仅活跃任务才显示）
  - 下载管理弹窗（任务列表 + 进度条 + 取消 / 移除）
  - 每 1.5s 自动轮询活跃任务进度
- **`AndroidManifest.xml`**：新增 `MANAGE_EXTERNAL_STORAGE`
- **路径**：`/storage/emulated/0/Download/One NAS/`

### App 图标 / 开屏（多轮迭代，最终方案）
- **`app.json`**：app 名 `One NAS`，新增 `expo-splash-screen` 插件配置（`backgroundColor: #FFFFFF` + `dark: #1a1a2e`，`imageWidth: 300`，`resizeMode: contain`）
- **`strings.xml`**：`app_name = One NAS`
- **SplashScreen**：`Theme.App.SplashScreen` 继承 `Theme.SplashScreen`（Android 12+ SplashScreen API，不拉伸）
  - 浅色：白底 + `#2563eb` "One NAS"
  - 深色：深底 `#1a1a2e` + `#60a5fa` "One NAS"
- **Adaptive Icon**：
  - 自适应图标背景用 `@color/splashscreen_background`（跟随主题）
  - 前景：`cbi--nas-v2.svg`（深蓝 `#1b3a8c` 机架）65% 居中，透明背景
  - monochrome：白色版（Android 13+ 主题图标）
- **`App.tsx`**：`SplashScreen.preventAutoHideAsync()` + 等 `loaded=true` 才 `hideAsync()`，开屏持续到主屏渲染完毕，无空白间隔
- **生成工具**：`assets/gen-splash-icons.js`（用 sharp 生成各密度 PNG）

### 仍存在的已知问题 / 待处理
- **`fix-android-env.ps1`**：编码 / 分词问题依然存在，非阻塞

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
- 保留 `react-native-webview`（将来文件预览用）
- 保留 `react-native-reanimated`（`react-native-draggable-flatlist` 依赖）

---

## ⓪ FileBrowser 功能增强

**目标**：以 FileBrowser 网页端功能为基准，补齐文件管理核心能力。

### 实现位置
- `src/lib/api/filebrowser.ts` — API 函数
- `src/screens/FileScreen.tsx` — UI 改造
- `src/lib/downloadManager.ts` — 后台下载封装
- `android/.../DownloadManagerModule.kt` — 系统下载原生模块
- `src/components/` — 新增预览 / 编辑 / 分享组件
- `src/types/index.ts` — 补充类型

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

#### ⑤ 分享功能 ✅
- **API**：`GET /api/shares` 列表、`POST /api/share/{path}` 创建（password / expires）、`DELETE /api/share/{hash}`
- **UI**：操作菜单「分享」→ 弹出配置（密码 / 过期）→ 自动复制链接
- **管理**：顶栏分享按钮 → 全屏分享管理（列表 / 删除 / 复制链接）

#### ⑦ 系统 DownloadManager 后台下载 ✅（新增）
- 原生模块 + JS 封装 + 下载管理弹窗 + 权限修复（见上文）

#### ⑧ 下载管理全屏 + 详情 Modal + 多选 ZIP 修复 + 进度轮询 ✅（新增）
- 下载按钮常驻、全屏管理页、全部清除
- 文件大小自动 B/KB/MB/GB 格式化
- 多选 ZIP 用 `?files=` 只打包选中文件
- 详情 Modal（名称/路径/大小/时间/分辨率/hash）
- 2s 进度轮询 + updateDownload

---

### P1 — 待开发 ❌

#### ③ 文件预览 ✅ 文本/代码/图片/HTML 已完成
| 类型 | 方案 | 状态 |
|------|------|------|
| **文本** (.txt/.md/.log) | `fetch` + `<ScrollView>` + `<Text>` | ✅ |
| **代码** (.js/.ts/.py/.go/) | 同上 + monospace 编辑 | ✅ |
| **JSON / XML / YAML** | 同上 | ✅ |
| **HTML** | `react-native-webview` | ✅ |
| **图片** | RN `<Image>` | ✅ |
| **PDF** | WebView 或分享 | ❌ 待后续 |
| **视频 / 音频** | 需装 `expo-av` | ❌ 待后续 |
| **电子书** | 暂不支持 | ❌ |

#### ④ 文件编辑 ✅ 文本/代码 已完成
- ✅ **API**：`GET /api/resources/{path}` → `content` → 编辑 → `PUT` 保存
- ✅ **UI**：全屏 `<TextInput multiline>` + 保存 / 取消按钮 + 未保存确认
- ❌ 大文件提示下载编辑（待后续）
- ❌ 语法高亮（待后续，需代码编辑器库）

#### ⑥ 搜索修复 ✅
- **根因**：Go 服务器用 `r.URL.Path` 作为搜索根目录，原始 URL `/api/search?query=xxx` 无 scope，返回全部文件
- **修复**：URL 改为 `/api/search/{currentPath}?query=xxx`，根目录时 `/api/search/?query=xxx`
- **流式边搜边显**：`response.body.getReader()` 逐 chunk NDJSON 解析 + `onItem` 回调
- **停止 / 关闭**：搜索中「搜索」按钮切换为「停止」；关闭按钮停止+清+关；系统返回键搜索中只停止不关
- **结果缓存**：跳转后回来保留结果，搜索后台继续追加

---

## ① NAS 管理修复

- [x] ContainerCard 状态大小写（RUNNING / EXITED / PAUSED）
- [ ] CPU / 内存显示为 0 — `DASHBOARD_QUERY` 删了 `info` / `metrics`，需要加回
- [ ] 字段映射待补：hostname、cpuModel、cpuCores、cpuThreads、memoryTotal/Used/Free/Percent、array.capacity、disks（temp/spinning）、vms（vcpus/memory）

---

## ② 主题颜色设置

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