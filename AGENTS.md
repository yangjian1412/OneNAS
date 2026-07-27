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
  - `queryProgress(downloadId)` → `{bytesDownloaded, totalBytes, status, uri}`
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

## JS splash flow (talebook-style)

- `App.tsx` calls `SplashScreen.preventAutoHideAsync()` at module scope
- While `loaded=false`, renders `<SplashView />` (theme-colored background + centered "One NAS" text)
- After `loaded=true`, calls `SplashScreen.hideAsync()` and renders main UI
- Native splash and JS SplashView share the same color resource (`@color/window_background`) so transition is seamless

## FileBrowser downloads

- All downloads go through Android `DownloadManager` via `src/lib/downloadManager.ts`
- File: `/storage/emulated/0/Download/One NAS/<filename>`
- Folder ZIP: `GET /api/raw/{path}?format=zip`, saved as `<foldername>.zip`
- UI: toolbar shows a down-arrow download-management button only when there are active tasks
- In-app `DownloadManage` modal lists tasks with progress bars + status + cancel/remove