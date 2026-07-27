# One NAS

<div align="center">

**面向 Unraid NAS 的原生 Android 管理面板** — 文件管理、Docker 容器、系统监控，统一入口。

[![Platform](https://img.shields.io/badge/Platform-Android-green?style=flat-square&logo=android)](https://github.com/yourusername/one-nas)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)
[![Expo SDK](https://img.shields.io/badge/Expo%20SDK-57-black?style=flat-square&logo=expo)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.86-blue?style=flat-square&logo=react)](https://reactnative.dev)

**APK 已发布** · 支持 arm64-v8a · 约 52 MB

</div>

---

## 功能亮点

### 文件管理（FileBrowser）

- 原生文件浏览器 — 浏览、上传、下载、新建、重命名、复制、移动、删除
- **文件夹 ZIP 打包下载** — 多选文件/文件夹打包，调用系统 DownloadManager 后台下载
- **文件预览** — 文本、代码、JSON、HTML、图片、PDF、Office、**视频**、**音频**（直链不转码）
- **文件编辑** — 文本/代码在线编辑，`PUT` 保存
- **分享** — 创建带密码/过期时间的分享链接，一键复制
- **流式搜索** — 边搜边显示，支持按目录范围搜索
- 列表/平铺视图切换，8 类文件类型图标，多选/批量操作

### NAS 系统管理（Tab4）

- 系统资源**仪表盘** — CPU / 内存 / 阵列环形进度
- **磁盘列表** — 温度、容量、状态一览，支持 PARITY/DATA/CACHE 分类型显示
- **Docker 容器** — 启动/停止/重启，容器详情弹窗
- **虚拟机管理** — 查看 VM 名称和运行状态
- Auto Refresh（5 秒间隔，20 秒超时保护）

### 服务入口

- 首页固定服务栏（最多 4 个），支持跳转到原生 App 或内嵌卡片
- 支持服务：FileBrowser、Jellyfin、Navidrome、Audiobookshelf、Immich、Calibre、qBittorrent、OpenList 等

### 原生体验

- 浅色 / 深色 / 跟随系统主题
- 原生 SplashScreen + Adaptive Icon（深蓝机架图标）
- 系统返回键智能处理（子目录→上级→根目录→退出）
- 精确权限检测（"所有文件访问权限"引导）

---

## 截图

> 截图待补

---

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | React Native 0.86 + Expo SDK 57 |
| 语言 | TypeScript |
| 状态管理 | Zustand + 加密持久化 |
| 导航 | @react-navigation/native + bottom-tabs |
| 文件/上传 | expo-file-system + expo-document-picker |
| 后台下载 | Android DownloadManager（原生 Kotlin 模块） |
| 音视频 | expo-video + expo-audio（Media3/ExoPlayer） |
| 图标 | react-native-svg + 自定义 SVG |
| 后端 | 直接对接 FileBrowser API + Unraid GraphQL，无独立后端 |

---

## 快速开始

### 环境

- Node.js 20+
- JDK 17（Temurin）
- Android SDK API 35+ / NDK 27.x

### 安装

```bash
npm install
# Windows 中国大陆用户额外执行：
powershell -ExecutionPolicy Bypass -File ./fix-android-env.ps1
```

### 构建

```bash
# 构建 APK
cd android && .\gradlew.bat assembleDebug

# 安装到设备
adb install -r android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk
```

APK 产物：`android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk`（约 52 MB，仅 arm64-v8a）

---

## 项目结构

```
src/
├── App.tsx                    # 入口，SplashScreen 续命
├── navigation/TabNavigator.tsx # 5 个 Tab
├── screens/
│   ├── FileScreen.tsx         # 文件管理
│   ├── ServiceScreen.tsx      # 服务入口
│   ├── DockerScreen.tsx       # NAS 管理
│   └── SettingsScreen.tsx     # 设置
├── components/                # UI 组件
├── stores/appStore.ts         # Zustand 全局状态
└── lib/                      # API 封装、工具函数

android/app/src/main/java/com/unraiddash/app/
├── DownloadManagerModule.kt   # 原生下载模块
├── MainActivity.kt            # SplashScreen 主题
└── MainApplication.kt         # 模块注册
```

---

## 下一步计划

详见 [docs/NEXT-PLAN.md](./docs/NEXT-PLAN.md)。

**进行中 / 规划中：**

- 媒体服务器集成（Jellyfin / Navidrome / Audiobookshelf）— 内嵌浏览 + 直链播放
- 下载管理「打开文件」— 调用系统 App
- 主题颜色自定义

---

## 许可证

[MIT](./LICENSE)
