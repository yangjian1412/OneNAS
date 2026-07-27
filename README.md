# One NAS

One NAS 是一个面向 Unraid NAS 用户的原生 Android 管理面板。
它把日常 NAS 操作（文件管理、Docker 容器、常用服务入口）集中到一个 App 里，
让你不用在浏览器和多个 App 之间来回切换。

> 当前目标平台：**Android**（通过 Expo SDK 57 + React Native 0.86 构建）
> Android 显示名：One NAS / 包名：com.unraiddash.app

---

## ? 核心功能

- **文件管理（FileBrowser）**
  - 基于 FileBrowser API 的原生文件浏览器
  - 浏览目录、新建文件夹、上传、下载、重命名、复制、移动、删除
  - 文件夹打包下载（ZIP）— 浏览器同级打包到系统下载管理器
  - 系统 DownloadManager 后台下载 + 通知栏进度，文件落地 `/storage/emulated/0/Download/One NAS/`
  - 下载任务管理（活跃任务才显示入口，下箭头查看进度 / 取消）
  - "所有文件访问权限" 精确检测，弹原生设置引导
  - 列表 / 平铺两种视图，按扩展名分类的文件类型图标（8 类：image / video / audio / text / archive / code / document / book）
  - 长按弹出操作菜单（下载 / 打包 / 分享 / 重命名 / 复制 / 移动 / 删除）
  - 分享：创建分享（密码 + 过期）→ 自动复制链接；顶栏分享按钮进入分享管理（列表 / 删除）
  - 搜索（FileBrowser `/api/search`）
  - 多选 + 全选 + 批量操作（底部工具栏）
  - 切换目录自动回顶

- **NAS 系统管理**
  - 连接 Unraid GraphQL API
  - Docker 容器列表（启动 / 停止 / 重启）
  - 系统资源概览

- **首页入口**
  - 顶部固定一行（最多 4 个），超出的服务弹"更多"菜单
  - 服务图标点击：
    - 跳到原生 App（通过 Android Intent，例如 Immich）
    - 弹内嵌页 ServiceCard
  - 顶部入口顺序在设置中长按调整
  - Tab 选中态上方加主题色条

- **灵活设置**
  - 服务、标签、主题配置分组
  - 配置导入 / 导出 JSON（明文存于本地 AsyncStorage）

- **原生的细节**
  - 深色 / 浅色 / 跟随系统主题（背景色与开屏文字色自动跟随）
  - 系统返回键智能返回层级（子目录 → 上级 / 根目录 → 二次返回退出）
  - 原生 SplashScreen（`expo-splash-screen` + Theme.SplashScreen）：白底深字 / 深底浅字 "One NAS"，无拉伸
  - 原生 Adaptive Icon：mipmap 全密度 .webp + 自动形状遮罩
  - 底部 Action Sheet、Toast 提示、List/Grid 切换、键盘避让等

---

## ?? 截图

> TODO: 在 App 上线后补一张首页 / 文件管理 / 设置页的截图。

---

## ?? 技术栈

| 层 | 技术 |
| --- | --- |
| 框架 | React Native 0.86 + Expo SDK 57 |
| 语言 | TypeScript ~6.0 |
| 状态管理 | Zustand（带 `persist` + 加密中间层） |
| 导航 | `@react-navigation/native` + `bottom-tabs` |
| 文件 / 上传 | `expo-file-system` + `expo-document-picker` |
| 后台下载 | Android `DownloadManager`（原生 Kotlin 模块 `DownloadManagerModule.kt`） |
| 开屏 | `expo-splash-screen` + `androidx.core:core-splashscreen` |
| 图标 | `react-native-svg` + 自定义 SVG 资产（`src/icos/`） |
| ID 生成 | `expo-crypto`（仅 `randomUUID()`） |
| 拖拽 | `react-native-draggable-flatlist` + `react-native-gesture-handler` + `react-native-reanimated` |
| 后端 | 直接对接 FileBrowser API 与 Unraid GraphQL，无独立后端 |

---

## ?? 快速开始

> 建议使用 PowerShell（Windows）或 Bash（macOS / Linux）。
> 项目尚未配置完整的 CI，所有构建在本地完成。

### 1. 环境准备

- Node.js 20+
- JDK 17（推荐 Temurin）
- Android SDK（API 35+、Build-Tools 35+）
- Android NDK 27.x（如果安装原生依赖）
- PowerShell（仅 Windows，需要运行 `fix-android-env.ps1`）

### 2. 安装依赖

```bash
npm install
# Windows 用户在中国大陆建议额外执行：
powershell -ExecutionPolicy Bypass -File ./fix-android-env.ps1
```

这个脚本会：

1. 移除 `node_modules` 下所有 `.gradle` / `.kts` 文件的 BOM
2. 在 Expo / React Native gradle 插件中加入 Aliyun 镜像
3. 避免 Gradle 在没有 BOM 处理时出现注释错误

### 3. 调试运行

```bash
npx expo start              # 启动 Metro
npx expo run:android        # 自动安装到已连接设备
```

### 4. 直接构建 APK

```bash
cd android
.\gradlew.bat assembleDebug
# 产物在 android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk
```

安装到设备：

```powershell
adb install -r android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk
```

> 当前 `splits.include` 只保留 `arm64-v8a`，APK 大小约 **52 MB**。
> 启用更多 ABI（armeabi-v7a / x86 / x86_64）请修改 `android/app/build.gradle`。

---

## ?? 目录结构

```
src/
├── App.tsx                  # 入口，挂载 TabNavigator + SafeAreaView；SplashScreen 续命到主屏渲染完毕
├── navigation/
│   └── TabNavigator.tsx     # 5 个 Tab：文件 / 标签2 / 标签3 / NAS / 设置
├── screens/
│   ├── FileScreen.tsx       # FileBrowser 主界面（列表 / 平铺 / 多选 / 下载管理）
│   ├── ServiceScreen.tsx    # 分配到标签的服务入口
│   ├── DockerScreen.tsx     # NAS 系统管理
│   └── SettingsScreen.tsx   # 服务设置 / 标签 / 主题 / 导入导出
├── components/
│   ├── ServiceBar.tsx       # 首页顶部 4 个服务入口
│   ├── ServiceCard.tsx      # 服务内嵌卡片
│   ├── ContainerCard.tsx    # Docker 容器卡片（容器状态匹配大写 RUNNING / EXITED / PAUSED）
│   └── ConfigModal.tsx      # 设置里各种配置的弹窗
├── stores/
│   └── appStore.ts          # Zustand 全局状态 + 加密持久化
├── lib/
│   ├── api/
│   │   ├── client.ts        # buildUrl / apiFetch / apiGraphQL
│   │   ├── filebrowser.ts   # FileBrowser REST API（登录 / 资源 / 分享）
│   │   └── unraid.ts        # Unraid GraphQL（DASHBOARD_QUERY）
│   ├── android-intent.ts    # 原生 App 跳转（Immich 等）
│   ├── crypto.ts            # AES-GCM 加密 / 解密
│   ├── downloadManager.ts   # JS 封装原生 DownloadManager（enqueue / queryProgress / cancel）
│   ├── fileTypes.ts         # 文件扩展名 → 图标名映射（getFileIcon）
│   ├── storage.ts           # AsyncStorage 封装
│   ├── theme.ts             # 浅色 / 深色 / 系统主题
│   └── constants.ts         # 服务类型常量
└── types/
    └── index.ts             # ServerConfig / ServiceConfig / FileItem / DownloadTask / ShareInfo 等

android/app/src/main/java/com/unraiddash/app/
├── MainApplication.kt       # 注册 DownloadManagerPackage
├── MainActivity.kt          # setTheme(AppTheme) → super.onCreate(null)
├── DownloadManagerModule.kt # 原生模块：isExternalStorageManager / enqueueDownload / queryProgress / cancel / remove
└── DownloadManagerPackage.kt

android/app/src/main/res/
├── mipmap-anydpi-v26/      # 自适应图标 XML（背景 = @color/splashscreen_background，跟随主题）
├── mipmap-{m,h,xh,xxh,xxxh}dpi/   # 各密度 .webp（ic_launcher / foreground / monochrome）
├── drawable-*/splashscreen_logo.png         # 浅色开屏（白底蓝字 One NAS）
├── drawable-night-*/splashscreen_logo.png   # 深色开屏（深底浅蓝字）
├── values/values-night/colors.xml          # splashscreen_background：白 / #1a1a2e
└── values/styles.xml                        # Theme.App.SplashScreen 继承 Theme.SplashScreen
```

---

## ?? 下一步计划

详见 [docs/NEXT-PLAN.md](./docs/NEXT-PLAN.md)。

FileBrowser P1 已全部完成 ✅：
1. **文件预览**（文本 / JSON / HTML / 图片 / PDF / Office / 视频·音频）✅
2. **文件编辑**（文本 / JSON / HTML）✅
3. **搜索修复** ✅
4. **zip下载修复** ✅
5. **下载管理**（系统 DownloadManager）✅
6. **开屏画面** ✅

下一步优先级：
- **P2**：下载管理「打开文件」（调用系统 App）
- **P2**：NAS CPU / 内存显示修复
- **P3**：主题颜色自定义（主色调选择）
- **规划中**：媒体服务器集成（Jellyfin / Navidrome / Audiobookshelf / Emby）

---

## ?? 贡献

欢迎提 Issue / PR。
代码风格：

- TypeScript 不引入未使用变量
- 主要变更前请在本地运行 `npm install` + `fix-android-env.ps1`（Windows）
- PR 标题建议遵循 `feat:` / `fix:` / `chore:` 等约定

## ?? 许可证

MIT