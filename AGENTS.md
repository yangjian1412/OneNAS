# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Project context

- Android-only React Native app (Expo SDK 57 + RN 0.86)
- Java toolchain: JDK 17 (Temurin)
- Android SDK 35/36 with NDK 27.x
- Gradle 8.14.x
- Builds via `gradlew.bat assembleDebug` in `android/`, output is `arm64-v8a` only (~52 MB)
- For China installs, run `fix-android-env.ps1` after every `npm install` (BOM + Aliyun mirror patches)
- Use Windows PowerShell 5.1 — `&&` chained commands don't work, use `cmd1; if ($?) { cmd2 }`
- See [README](../README.md) and [NEXT-PLAN](NEXT-PLAN.md) for full context

## App identity

- Display name: **One NAS** (`app.json name` + `android/.../res/values/strings.xml app_name`)
- Package: `com.unraiddash.app`
- Slug: `one-nas`

## Native modules (Kotlin) under `android/app/src/main/java/com/unraiddash/app/`

- `MainApplication.kt` — registers `DownloadManagerPackage()`
- `MainActivity.kt` — `setTheme(R.style.AppTheme)` before `super.onCreate(null)` to dismiss native splash
- `DownloadManagerPackage.kt` — exposes `DownloadManagerModule`
- `DownloadManagerModule.kt` — methods:
  - `isExternalStorageManager()` → `Environment.isExternalStorageManager()` (precise check, Android 11+)
  - `openAllFilesAccessSettings()` → `Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION` (direct deep-link to All-files-access page)
  - `enqueueDownload(url, fileName, authToken)` → `DownloadManager.enqueue(Request.addRequestHeader("X-Auth", token).setDestinationInExternalPublicDir(Downloads, "One NAS/$fileName"))`
  - `enqueueDownloadWithHeader(url, fileName, headerName, headerValue)` → same as above but with arbitrary header (used for WebDAV `Authorization: Basic xxx`)
  - `queryProgress(downloadId)` → `{bytesDownloaded, totalBytes, status, uri, reason}`
  - `cancelDownload(downloadId)` / `removeDownload(downloadId)` → `DownloadManager.remove`

## AndroidManifest permissions

- `INTERNET`
- `READ_EXTERNAL_STORAGE` (maxSdkVersion 32)
- `WRITE_EXTERNAL_STORAGE` (maxSdkVersion 32)
- `MANAGE_EXTERNAL_STORAGE` (Android 11+)

## Splash screen (native two-phase)

- `android/app/src/main/res/values/styles.xml` `AppTheme` defines `android:windowBackground = @drawable/splash_window`
- `AppTheme` extends `Theme.AppCompat.DayNight.NoActionBar`, transparent status/nav bar, edge-to-edge
- `android/app/src/main/res/values/colors.xml` → `window_background = #FFFFFF` (light); `values-night` → `#1a1a2e`
- `drawable/splash_window.xml` = layer-list: `@color/window_background` + 居中" One NAS" 位图（`drawable/splash_text.png`，深蓝 `#1b3a8c` / `drawable-night/splash_text.png` 浅蓝 `#64b5f6`），位图显式 340×113dp
- 位图垂直位置：item `gravity="center_horizontal|bottom"` + `bottom="150dp"`（屏幕下方约 1/4 区域，避免居中显得偏高）
- Android 12+ 系统 splash（`windowSplashScreen*`）：
  - `windowSplashScreenBackground = @color/window_background`
  - `windowSplashScreenAnimatedIcon = @drawable/splash_empty`（**透明 shape**，让系统 splash 只显示纯色，与窗口背景衔接无缝）
  - `windowSplashScreenIconBackgroundColor = @android:color/transparent`
- 文字 PNG：`drawable/splash_text.png` 1440×480 透明背景，用 `System.Drawing` 渲染 "One NAS" Segoe UI Bold 170px
- **无 JS SplashView**（`src/components/SplashView.tsx` 已删）—— `App.tsx` 直接渲染 `<TabNavigator />`，省 400ms 强制等待
- **不调用 `expo-splash-screen`**（项目未装该包），原生 splash 由系统自动管理

## Adaptive icon

- `mipmap-anydpi-v26/ic_launcher.xml` (and `ic_launcher_round.xml`) reference:
  - `<background android:drawable="@color/splashscreen_background"/>` — theme-aware background
  - `<foreground android:drawable="@mipmap/ic_launcher_foreground"/>` — deep-blue rack icon (`cbi--nas-v2.svg`, fill `#1b3a8c`) at 65% size
  - `<monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>` — white version for Android 13+ themed icons
- `mipmap-{m,h,xh,xxh,xxxh}dpi/` — `.webp` files generated via `sharp` from `assets/cbi--nas-v2.svg`

## Unraid GraphQL docker mutations (compatibility)

Unraid API 不同版本的 `DockerMutations` 字段集不同（**严禁**带 `Container` 后缀或 `wait` 参数调用，那是早期错误写法）：

| Unraid API 版本 | `start` | `stop` | `restart` | `pause` | `unpause` |
|---|---|---|---|---|---|
| 4.32.x / 4.33.x / 4.34.x | ✅ | ✅ | ❌ | ✅ | ✅ |
| 4.35.0+ | ✅ | ✅ | ✅ | ✅ | ✅ |

实现位置：
- `src/lib/api/unraid.ts`：暴露 `startContainer`/`stopContainer`/`restartContainer(server, id)` 三个函数（API 与签名保持稳定）
- `src/lib/api/unraidCapabilities.ts`：introspection 探测 `{ __type(name: "DockerMutations") { fields { name } } }`，结果按 `server.id` 缓存在内存（**不持久化**到 AsyncStorage，避免服务端升级后旧缓存误导）
- `restartContainer` 路由：有 `restart` → 直接用；没有 → fallback `stop` + `await sleep(RESTART_FALLBACK_DELAY_MS=1500)` + `start`
- 服务端返回 `Cannot query field`/`Unknown field` 错误时自动 `invalidateDockerCapabilities(server.id)`，下次重新探测
- DockerScreen mount 时 `useEffect(() => { unraidServers.forEach((s) => void getDockerCapabilities(s)) }, [unraidServers])` 预探测，避免首次操作多 ~100ms

错误信息提示：探测到缺失字段时（如极端旧 API 无 `start`），返回 `{ ok: false, error: '当前 Unraid API 版本不支持 start 容器，请升级 Unraid API 插件至 ≥ 4.35' }`，走 DockerScreen 现有的 `Alert.alert('操作失败', result.error)`。

VM mutations (`vm { start/stop/reboot/pause/resume/forceStop/reset }`) schema 稳定，无需特殊处理。

## NAS 管理双后端（Unraid / Portainer）

- 设置 → 服务设置 → NAS 管理 可切换 `unraid` 或 `portainer`（`appStore.nasManagementBackend`，默认 `unraid`，持久化）
- `NasManagementScreen` 是路由壳：`backend === 'portainer'` 时渲染 `PortainerScreen`，否则渲染 `DockerScreen`（Tab4 图标也随后端切换：`docker` / `unraid`）
- **Portainer 与 Unraid 配置完全独立**：Unraid 走 `servers[]`（type `unraid`），Portainer 走 `appStore.portainerServer`（`PortainerConfig`：`{ id, name, url, apiToken }`），不共享字段
- `src/lib/api/portainer.ts`：认证头按版本分支 —— Portainer v1.x 用 `X-Api-Key`，v2.x 用 `Authorization: Bearer <Access Token>`（`getJson`/`fetchPortainerDashboard` 内部处理）
- `portainerPing` 先 `GET /api/endpoints` 拿端点列表，`pickDefaultEndpoint` 取第一个；仪表盘数据 = endpoint 信息 + `GET /api/endpoints/{id}/docker/containers/json?all=1`
- 容器操作 POST `/api/endpoints/{id}/docker/containers/{cid}/{action}`（start/stop/restart/pause/unpause/kill）
- 空态文案："未配置 Portainer" → 设置 → 服务设置 → NAS 管理 切换为 Docker（Portainer）并配置服务器

## Jellyfin / Emby 投屏（DLNA via 服务端）

- **本 App 是控制端，不实现 DLNA 协议**。Jellyfin/Emby 服务端内置 DLNA server，会自动发现 UPnP 设备并把流推给电视/盒子。客户端只负责选设备 + 转发控制指令
- **API（`src/lib/api/jellyfin.ts`）**：
  - `jellyfinGetSessions(server)`：拉 `/Sessions`，过滤 `Capabilities.SupportsMediaControl === true && PlayableMediaTypes.includes('Video')` 的设备
  - `jellyfinCast(server, targetSessionId, { itemId, startPositionTicks?, mediaSourceId?, audioStreamIndex?, subtitleStreamIndex? })`：`POST /Sessions/{targetId}/Playing?ItemIds=...&PlayCommand=PlayNow&...`
  - `jellyfinSendPlaystate(server, targetId, command, seekPositionTicks?)`：`POST /Sessions/{targetId}/Playing/{command}`（`Stop`/`Unpause`/`Pause`/`Seek`/`NextTrack`/`PreviousTrack`/...）
  - `jellyfinGetSessionById(server, targetId)`：轮询 `/Sessions` 拉目标 session 的 `PlayState.PositionTicks`、`NowPlayingItem.RunTimeTicks` 与 `IsPaused`
- **状态层（`src/stores/jellyfinCastStore.ts`）**：
  - `useJellyfinCastStore` 单例，`castTarget / castItem / castPosition / castDuration / castPaused`
  - 投屏时启动 5s 轮询；停止时调 `Stop` 并清空 store
- **UI**：
  - 入口：`JellyfinPlayer` 底部控制栏 `connectedTv` 图标按钮 → `CastDeviceListModal`（`src/components/CastDeviceListModal.tsx`）
  - 投屏成功 → 关闭本地播放器 → `CastRemotePage`（`src/components/CastRemotePage.tsx`）接管显示，含进度条（5s 轮询刷新）+ 暂停/恢复/上下一集 + 退出投屏
- **限制**：仅单集投屏；不注册本 App 为可被控 session（单向）；不实现 UPnP/DLNA 原生协议。**设备不需要安装 Jellyfin/Emby 客户端** —— 服务端自带的 DLNA server 通过 SSDP 在局域网发现 UPnP 播放设备（如电视/盒子），它们会作为普通 session 出现在 `/Sessions`（`Client: "DLNA"`）。前提是设备支持 DLNA 且与服务器**同一局域网**（SSDP 组播不能跨 VLAN/子网）

## FileBrowser copy/rename 必须 PATCH

- 路由：`PATCH /api/resources/{path}?action=copy&destination=...` / `?action=rename&destination=...`（**不能 GET**！）
- 参考实现 `ref-src/filebrowser-src/filebrowser-2.63.18/http/resource.go:212` `resourcePatchHandler` + `patchAction`（line 340）
- `destination` 是**目标完整路径**（含新文件名/文件夹名），不是目标目录；目录目标需要尾斜杠（避免 mod_dav 301 降级同 WebDAV）
- 早期实现漏传 `method`，默认 GET 请求被路由到 `resourceGetHandler` → 返回目录列表 → `requestResource` 看到 200 OK 静默成功 → 用户感觉"没反应"
- `src/lib/api/filebrowser.ts` 的 `copyResource` / `renameResource` 必须显式 `{ method: 'PATCH' }`
- WebDAV 后端不受影响（用 `MOVE`/`COPY` 方法，单独的 `webDavMove`/`webDavCopy` 函数）

## FileBrowser file details

- Long-press / three-dot menu → "详细信息" (between 移动到... and 删除)
- Fetches `GET /api/resources/{path}` for full resource data
- Modal shows: name, path, size (formatFileSize auto B/KB/MB/GB), modified time, resolution (images)
- Directories: file count, folder count
- Files: inline checksum links — MD5/SHA1/SHA256/SHA512, tap to compute via `GET /api/resources/{path}?checksum={algo}`
- `formatFileSize()` and `formatDateTime()` helpers at module level
- `commonParent()` utility for multi-file ZIP URL construction

## JS splash flow

- **无 JS splash**：`App.tsx` mount 时直接渲染 `<TabNavigator />`，启动瞬间 RN 接管原生窗口
- 原生 splash → 应用窗口背景（`splash_window` layer-list）→ 主 UI；两阶段文字一致，位置位于下方约 1/4

## FileBrowser downloads

- All downloads go through Android `DownloadManager` via `src/lib/downloadManager.ts`
- File: `/storage/emulated/0/Download/One NAS/<filename>`
- Folder ZIP: `GET /api/raw/{path}?algo=zip`, saved as `<foldername>.zip`
- Multi-file ZIP: `GET /api/raw/{parent}?algo=zip&files=rel1,rel2` — uses `commonParent()` to compute parent dir + relative paths
- `totalBytes = contentLengthLong` (no `coerceAtLeast(0)`) — streaming ZIP returns -1, JS shows "下载中 xx MB" instead of percentage
- UI: toolbar always shows download icon
- In-app `DownloadManage` full-page modal lists tasks with progress bars + status + cancel/remove + "全部清除" button
- Progress polling via `useEffect` interval (every 2s) — calls `pollTaskProgress` + `updateDownload`
- `src/stores/appStore.ts`: `clearDownloads()` action to remove all tasks

## FileBrowser file preview (FilePreviewModal.tsx)

- **Text/code**: `fetch` + `X-Encoding: true` → `decodeText()` (GBK fallback) → `<ScrollView><Text>`
- **HTML**: `react-native-webview` with `source={{ uri: rawUrl }}`
- **Images**: `fetch` + blob + `FileReader.readAsDataURL` → `<Image source={{ uri: dataURI }}` (RN `<Image>` doesn't support headers directly)
- **PDF/Office**: `expo-intent-launcher` `startActivityAsync(ACTION_VIEW)` — downloads to cache, gets content URI, opens system app
- **Video**: `expo-video` `VideoView` + `useVideoPlayer({ uri, headers: { 'X-Auth': token } })` — Media3/ExoPlayer backend, supports fullscreen + PiP
- **Audio**: `expo-audio` `useAudioPlayer({ uri, headers: { 'X-Auth': token } })` — Media3/ExoPlayer backend, custom UI with play/pause/progress/time
- **File category**: `getFileCategory()` in `src/lib/fileTypes.ts` returns `text|image|html|pdf|video|audio|system|other`
- **GBK encoding**: `iconv-lite` + `buffer` polyfill, `decodeText()` chain: UTF-8 strict → iconv gbk → UTF-8 loose

## WebDAV file manager

Alternative file backend. Switch via Settings → 服务设置 → 文件管理 → WebDAV. Uses Basic auth over HTTP(S).

- **PROPFIND 必须显式带 body**：`<?xml version="1.0" encoding="utf-8"?><D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/><D:getcontentlength/><D:getlastmodified/><D:displayname/></D:prop></D:propfind>`。Alist / OpenList / 部分 NAS 在不带 body 或仅 `<D:allprop/>` 的响应里不返回 `<D:resourcetype>`，导致所有目录被误判为文件（用户曾撞坑）
- **Auth header**: `Authorization: Basic <base64("user:pass")>` — RN Hermes has no `btoa`/`unescape`, so `src/lib/api/webdav.ts` exports a self-contained UTF-8 → Base64 encoder (`utf8Encode` + `toBase64`). **Do not** try `btoa(unescape(encodeURIComponent(...)))` — it throws on Hermes.
- **Listing**: `PROPFIND {url} Depth:1` → multistatus XML (207). The parser MUST accept namespace-prefixed tags: `<D:href>`, `<D:resourcetype>`, `<d:getcontentlength>`, etc. Use the helper `xmlMatch(block, 'href')` in `webdav.ts` (regex `(?:[A-Za-z]+:)?${tag}`).
- **目录 PROPFIND 必须带尾斜杠**：`webDavList` / 目录的 `webDavGetResourceInfo(isDir=true)` 构造 URL 时强制以 `/` 结尾。Apache mod_dav 对无尾斜杠的集合 PROPFIND 返回 301 且 Location 降级为 `http://`，RN fetch 跟随跳转时因 https→http origin 变化丢弃 Authorization 头 → 401（用户实测根因）。文件 PROPFIND 保持无斜杠。
- **Path normalization**: Always pass relative paths (`/foo/bar.txt`) into the API. Helpers: `normalizeRelativePath(p)` strips URL prefixes and trailing slashes; `joinDavUrl(base, sub)` builds the full URL with per-segment RFC 3986 encoding (`encodeDavSegment` = `encodeURIComponent` + 转义 `!'()*`)，正确处理中文 / 非 ASCII 文件名。
- **Auth header accessor**: `webDavAuthHeader(server)` → `Basic ...` — used by fileManager `getAuthHeaders()` for preview fetches.
- **Download**: `webDavDownloadUrl(server, path)` returns the URL; call `enqueueDownloadWithHeader(url, name, 'Authorization', header)` from `src/lib/downloadManager.ts`.
- **Upload**: 必须用 `expo-file-system` 的 `File.upload(url, { httpMethod: 'PUT', uploadType: BINARY_CONTENT, headers })` —— RN/Hermes 没有 WHATWG `File`/`Blob` 全局，`new File(localUri).arrayBuffer()` 会抛 `File is not defined`。FileScreen upload 链路已切到 `expo-file-system`。
- **Preview** (`FilePreviewModal.tsx`): component props now include `backend: FileBackend` + `webdavServer: WebDavConfig | null`. Build `authHeaders` once (`{ Authorization: webDavAuthHeader(...) }` for WebDAV, `{ 'X-Auth': token }` for FileBrowser) and pass to children instead of bare `token`.
  - **Images**: `fetch + blob + FileReader.readAsDataURL` (RN `<Image>` doesn't take headers directly)
  - **Video**: `useVideoPlayer({ uri, headers })` — supports HTTP Range, streams
  - **Audio**: `useAudioPlayer({ uri, headers })` — streams
  - **Text/code/HTML**: `fetch + decodeTextBuffer(buf)` (GBK fallback chain — see `decodeTextBuffer` in `FilePreviewModal.tsx`). **HTML is rendered as source text** — `react-native-webview` cannot inject custom HTTP headers, so HTML preview is source-view (same as text).
  - **PDF/Office**: download to cache via `FileSystem.downloadAsync(url, cachePath, { headers })`, then `expo-intent-launcher startActivityAsync('android.intent.action.VIEW', ...)`. Same flow as FileBrowser.
- **Resource info**: `webDavGetResourceInfo(server, path)` — `PROPFIND Depth:0` returns `{ path, name, isDir, size, modified }`.
- **Unsupported in WebDAV mode (UI 完全隐藏)**：search header 图标、share 管理 header 图标、详情 modal 中 checksum 区域、action sheet "打包下载"（仅 filebrowser）。底层函数（`fmSearchStream` / `fmGetShares` / `fmCreateShare` / `fmDeleteShare` / `fmGetFileChecksum`）保留 stub 返回 `ok:false` 兜底。

## Service page conventions (drawer + screen + store)

Every service page (jellyfin, emby, navidrome, audiobookshelf, talebook, aria2, qbittorrent, openlist) MUST follow these conventions.

## react-native-draggable-flatlist 使用注意

- **整个页面只用一个 `NestableScrollContainer`** 包住整页内容，`NestableDraggableFlatList` 作为其后代直接渲染（不要再套一层 `NestableScrollContainer`）
- **切忌嵌套第二个 `NestableScrollContainer`**：每个容器都创建独立的 Provider（`useSetupNestableScrollContextValue` 每次实例化独立 state/sharedValue），`NestableDraggableFlatList` 的 `setOuterScrollEnabled(false)` 只禁用它所在的**最近一层** ScrollView。若再套内层容器，内层 list 的 drag 把 scroll 禁用在内层，外层页面 ScrollView 仍可滚动 → 长按拖拽时**屏幕滚、目标不跟随**
- 库自身语义：`NestableScrollContainer` 即 RNGH `ScrollView` + Provider，`NestableDraggableFlatList` 通过同一 context 读取 `outerScrollOffset/containerSize/scrollViewSize` 做 autoscroll，并切 `outerScrollEnabled` 协调外层 scroll。所以必须让列表与外层 ScrollView 共享同一个 Provider
- 示例：`src/screens/SettingsScreen.tsx` 服务排序：整个 `header`/页面内容放进**一个** `<NestableScrollContainer>`，`sortMode` 时直接渲染 `<NestableDraggableFlatList data={rows} .../>`（无内层 ScrollView 包裹）

### Store contract (zustand)

```ts
interface ServiceState {
  server: ServerConfig | null   // 当前服务配置；initWithService 写入
  data: ...                     // 该服务的核心数据
  loading: boolean
  error: string | null
  autoRefresh: boolean          // 全局共享：所有 screen 实例读到同一个值
  setAutoRefresh: (v: boolean) => void

  setServer: (s: ServerConfig | null) => void
  setError: (e: string | null) => void
  logout: () => void

  initWithService: (service: ServiceConfig) => Promise<void>
  refresh: () => Promise<void>
  ...service-specific actions
}
```

### Singleton polling (CRITICAL)

If the service supports auto-refresh, the **store** owns a module-level `setInterval` and the **screen never** writes `useEffect` with `setInterval`. This prevents multiple screen instances (tab2/3 + top-bar inline) from racing each other.

Template inside the store file:

```ts
let pollTimer: ReturnType<typeof setInterval> | null = null
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } }

export const useServiceStore = create<ServiceState>((set, get) => {
  const startPolling = () => {
    stopPolling()
    const s = get()
    if (!s.autoRefresh || !s.server) return
    pollTimer = setInterval(() => { void get().refresh() }, AUTO_REFRESH_MS)
  }
  return {
    /* ... */
    setAutoRefresh: (v) => {
      set({ autoRefresh: v })
      AsyncStorage.setItem(KEY, v ? '1' : '0').catch(() => {})
      if (v) startPolling(); else stopPolling()
    },
    setServer: (s) => { set({ server: s }); startPolling() },
    initWithService: async (svc) => { /* ... */; startPolling() },
    logout: () => { stopPolling(); set({ server: null, ... }) },
  }
})
```

Export a `loadXxxAutoRefreshPersisted(): Promise<boolean>` helper. Call it from `appStore.init()` after main config load and apply via `useServiceStore.setState({ autoRefresh: v })`.

### Screen header layout

Three-column header. Use the generic component at `src/components/ServiceHeader.tsx`. Three modes:

```ts
// download (aria2 / qbittorrent) — 标题 + 自动开关 + 刷新
<ServiceHeader
  mode="download"
  t={t}
  title={server.name}
  onMenuPress={() => setDrawerOpen(true)}
  autoRefresh={autoRefresh}
  setAutoRefresh={setAutoRefresh}
  onRefresh={() => { void refresh() }}
/>

// filebrowser (openlist) — 标题 + 副标题 + 刷新，无自动开关
<ServiceHeader
  mode="filebrowser"
  t={t}
  title={server.name}
  subtitle="已登录（admin）"   // optional status sub-line
  onMenuPress={() => setDrawerOpen(true)}
  onRefresh={() => { void refresh() }}
/>
```

**Reference**: navidrome / talebook are the canonical searchable layouts (search box in the center, menu/back on the left, no auto-refresh switch). They keep their own `NavidromeHeader` / `TalebookHeader` components. New searchable services should follow the same pattern; new download / filebrowser services must use `<ServiceHeader>`.

### ServiceDrawer (side drawer)

Use the generic component at `src/components/ServiceDrawer.tsx`. It slides in from the **left** (75% width), with:

- **Header (top)**: X close button (top-right corner)
- **User section**: circular avatar (first letter of `userInfo.avatar` or `name`) + display name + server URL
- **Menu items**: list of `DrawerItem` rows (icon + label + chevron-right), `destructive` flag tints text/border red
- **Footer (bottom)**: divider + `版本号: {version}` (optional) + `类型: {type}`

Props:

```ts
<ServiceDrawer
  visible={open}
  onClose={() => setOpen(false)}
  userInfo={{ name: server.name, url: server.url, avatar: server.username }}
  versionInfo={{ type: 'qBittorrent', version: '...' }}  // optional
  items={drawerItems}
  t={t}
/>
```

The drawer must handle its own back-button (use `BackHandler.addEventListener` inside the component, ignore when not visible).

### Settings pages (full-screen modal with X close)

All **settings pages** (configured per-service: download settings, basic settings, download-tool settings, common settings, server settings, etc.) must use the generic full-screen modal at `src/components/FullScreenModal.tsx`:

```tsx
<FullScreenModal visible={open} onClose={() => setOpen(false)} title="下载设置" t={t}>
  <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
    {/* form fields */}
  </ScrollView>
</FullScreenModal>
```

`FullScreenModal` is a real RN `<Modal>` (full-screen, slide animation) with:
- Top header: **X close icon top-right** (NOT a "关闭" text button)
- Title centered
- Children scrollable

For the **settings class** (download settings, basic settings, etc.) → **use FullScreenModal**. For the **action class** (add task, add URL, mkdir, add server, config) → keep the bottom-sheet Modal (slides up from bottom with rounded top corners, "取消" / "确认" buttons at the bottom). The two are visually and semantically distinct: settings pages are persistent configuration, action sheets are ephemeral tasks.

### Top-bar mount

Service screens are mounted in TWO places: the dedicated tab (`ServiceScreen`) and the top-bar overlay (`ActiveServiceView` in `FileScreen.tsx`). Both must use the **same** store singleton — that's why the polling lives in the store, not in the screen.

When mounted in `ActiveServiceView`, the elevation of the overlay (`styles.activeServiceRoot` in `FileScreen.tsx`) must be greater than `ServiceBar`'s elevation (currently 30 vs 20) so the overlay receives touch events on Android.

## Service back-button handling

Each service screen mounted on a stack (tab + top-bar overlay) MUST intercept the hardware back button itself. Pattern (see `NavidromeScreen.tsx:235-249` for canonical):

```ts
const sub = BackHandler.addEventListener('hardwareBackPress', () => {
  if (!isFocusedRef.current) return false
  // 1) Close any open modal / drawer / keyboard
  if (drawerOpen) { setDrawerOpen(false); return true }
  if (searchOpen) { setSearchOpen(false); return true }
  // 2) Pop stack if nested
  if (navigation.canGoBack()) { navigation.goBack(); return true }
  // 3) Ask parent to close overlay / exit to tab1
  if (onRequestClose) { onRequestClose(); return true }
  return false
})
```

Applied to all 4 download/filebrowser services (`Aria2Screen`, `QBitTorrentScreen`, `OpenListScreen`, plus top-bar `AudiobookshelfScreen` via `FileScreen.tsx:1257`). Do **not** add a `!isFocused` gate or 2000ms double-back-press — both lead to swallowed events; rely on `isFocusedRef` only.

## Talebook local browse history

Talebook 服务端**没有**"最近浏览"端点（`/api/recent` 是"最近添加"的新书推荐，与浏览无关；`/api/reading` 是"在读"，不是"已读"）。实现在客户端：

- `src/stores/talebookStore.ts`：
  - `initRecent(serviceId)` —— mount 时从 AsyncStorage `talebook:recent:<serviceId>` 读取最近浏览列表
  - `addRecent(book, serviceId)` —— `handleBookPress` 入口去重、`.slice(0, 10)`、写回 AsyncStorage
  - `recentBooks` —— 在 store state 中暴露给 Screen 渲染
- `src/screens/TalebookScreen.tsx`：首页"最近浏览"行直接读 `recentBooks`，最大 10 本，最新的在最前
- 跨服务隔离：每个 `serviceId` 独立存储，互不干扰

## Service drawer back-button handling

`ServiceDrawer` 自身必须监听 BackHandler：visible=false 时 `return false` 放行，visible=true 时关抽屉并 `return true`。**严禁**在外层 Screen 中拦截抽屉状态（会产生焦点冲突）。
