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

## Splash screen (talebook-style — Compose-like in RN)

- `android/app/src/main/res/values/styles.xml` defines `Theme.App.SplashScreen` extending `AppTheme` (both share `windowBackground = @color/window_background`)
- `AppTheme` extends `Theme.AppCompat.DayNight.NoActionBar` with explicit `android:windowBackground = @color/window_background`
- `android/app/src/main/res/values/colors.xml` → `window_background = #FFFFFF` (light)
- `android/app/src/main/res/values-night/colors.xml` → `window_background = #1a1a2e` (dark)
- Splash background = AppTheme background = same color resource (no flash on transition)
- Splash icon / drawable: NONE (no `splashscreen_logo.png`; pure color splash)
- Text "One NAS" rendered by JS in `src/components/SplashView.tsx` using `useTheme()` — color follows theme (`t.bg` background, `t.primary` text)

## Adaptive icon

- `mipmap-anydpi-v26/ic_launcher.xml` (and `ic_launcher_round.xml`) reference:
  - `<background android:drawable="@color/splashscreen_background"/>` — theme-aware background
  - `<foreground android:drawable="@mipmap/ic_launcher_foreground"/>` — deep-blue rack icon (`cbi--nas-v2.svg`, fill `#1b3a8c`) at 65% size
  - `<monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>` — white version for Android 13+ themed icons
- `mipmap-{m,h,xh,xxh,xxxh}dpi/` — `.webp` files generated via `sharp` from `assets/cbi--nas-v2.svg`

## FileBrowser file details

- Long-press / three-dot menu → "详细信息" (between 移动到... and 删除)
- Fetches `GET /api/resources/{path}` for full resource data
- Modal shows: name, path, size (formatFileSize auto B/KB/MB/GB), modified time, resolution (images)
- Directories: file count, folder count
- Files: inline checksum links — MD5/SHA1/SHA256/SHA512, tap to compute via `GET /api/resources/{path}?checksum={algo}`
- `formatFileSize()` and `formatDateTime()` helpers at module level
- `commonParent()` utility for multi-file ZIP URL construction

## JS splash flow (talebook-style)

- `App.tsx` calls `SplashScreen.preventAutoHideAsync()` at module scope
- While `loaded=false`, renders `<SplashView />` (theme-colored background + centered "One NAS" text)
- After `loaded=true`, calls `SplashScreen.hideAsync()` and renders main UI
- Native splash and JS SplashView share the same color resource (`@color/window_background`) so transition is seamless

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

- **Auth header**: `Authorization: Basic <base64("user:pass")>` — RN Hermes has no `btoa`/`unescape`, so `src/lib/api/webdav.ts` exports a self-contained UTF-8 → Base64 encoder (`utf8Encode` + `toBase64`). **Do not** try `btoa(unescape(encodeURIComponent(...)))` — it throws on Hermes.
- **Listing**: `PROPFIND {url} Depth:1` → multistatus XML (207). The parser MUST accept namespace-prefixed tags: `<D:href>`, `<D:resourcetype>`, `<d:getcontentlength>`, etc. Use the helper `xmlMatch(block, 'href')` in `webdav.ts` (regex `(?:[A-Za-z]+:)?${tag}`).
- **Path normalization**: Always pass relative paths (`/foo/bar.txt`) into the API. Helpers: `normalizeRelativePath(p)` strips URL prefixes and trailing slashes; `joinDavUrl(base, sub)` builds the full URL with per-segment `encodeURIComponent`.
- **Auth header accessor**: `webDavAuthHeader(server)` → `Basic ...` — used by fileManager `getAuthHeaders()` for preview fetches.
- **Download**: `webDavDownloadUrl(server, path)` returns the URL; call `enqueueDownloadWithHeader(url, name, 'Authorization', header)` from `src/lib/downloadManager.ts`.
- **Preview** (`FilePreviewModal.tsx`): component props now include `backend: FileBackend` + `webdavServer: WebDavConfig | null`. Build `authHeaders` once (`{ Authorization: webDavAuthHeader(...) }` for WebDAV, `{ 'X-Auth': token }` for FileBrowser) and pass to children instead of bare `token`.
  - **Images**: `fetch + blob + FileReader.readAsDataURL` (RN `<Image>` doesn't take headers directly)
  - **Video**: `useVideoPlayer({ uri, headers })` — supports HTTP Range, streams
  - **Audio**: `useAudioPlayer({ uri, headers })` — streams
  - **Text/code/HTML**: `fetch + decodeTextBuffer(buf)` (GBK fallback chain — see `decodeTextBuffer` in `FilePreviewModal.tsx`). **HTML is rendered as source text** — `react-native-webview` cannot inject custom HTTP headers, so HTML preview is source-view (same as text).
  - **PDF/Office**: download to cache via `FileSystem.downloadAsync(url, cachePath, { headers })`, then `expo-intent-launcher startActivityAsync('android.intent.action.VIEW', ...)`. Same flow as FileBrowser.
- **Resource info**: `webDavGetResourceInfo(server, path)` — `PROPFIND Depth:0` returns `{ path, name, isDir, size, modified }`.
- **Unsupported** (return error from FileManager): search, checksum, share. The action sheet hides "打包下载", "分享" buttons in WebDAV mode.

## Service page conventions (drawer + screen + store)

Every service page (jellyfin, emby, navidrome, audiobookshelf, talebook, aria2, qbittorrent, openlist) MUST follow these conventions.

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

Three-column header, exactly this layout (used by aria2, qbittorrent, openlist; jellyfin/emby/navidrome can keep their own header but should expose `onRequestClose` for the top-bar inline mount):

```
[☰ menu]      [service.name + status]      [⟳ refresh]
   └─ opens ServiceDrawer                  └─ calls store.refresh()
```

### ServiceDrawer

Use the generic component at `src/components/ServiceDrawer.tsx`. Items shape:

```ts
const items: DrawerItem[] = [
  { key: 'settings', label: '设置', icon: 'settings', onPress: () => setXOpen(true) },
  { key: 'about',    label: '关于', icon: 'info',      onPress: () => {} },
  { key: 'clear',    label: '清除', icon: 'trash', destructive: true, onPress: () => {} },
]
<ServiceDrawer visible={open} onClose={() => setOpen(false)} title="X" subtitle="..." items={items} t={t} />
```

The drawer must handle its own back-button (use `BackHandler.addEventListener` inside the component, ignore when not visible).

### Top-bar mount

Service screens are mounted in TWO places: the dedicated tab (`ServiceScreen`) and the top-bar overlay (`ActiveServiceView` in `FileScreen.tsx`). Both must use the **same** store singleton — that's why the polling lives in the store, not in the screen.
