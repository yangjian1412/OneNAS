import { Linking, Alert } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { launchApp } from './packageManager'

const KNOWN_IMMICH_PACKAGES = [
  'app.alextran.immich',
  'app.immich.immich',
  'app.immich',
]

const KNOWN_TALEBOOK_PACKAGES = [
  'com.talebook.app',
  'com.talebook.app.debug',
]

// 未上架应用的项目主页（用于未安装时提示）——immich 有上架，走应用商店
const TALEBOOK_GITHUB_URL = 'https://github.com/yangjian1412/talebook-android'

async function tryLaunchImmich(pkg: string): Promise<boolean> {
  return await launchApp(pkg, '.MainActivity')
}

async function tryLaunchTalebook(pkg: string): Promise<boolean> {
  return await launchApp(pkg, '.MainActivity')
}

async function openImmich(): Promise<void> {
  for (const pkg of KNOWN_IMMICH_PACKAGES) {
    if (await tryLaunchImmich(pkg)) return
  }
  // 正常上架：弹应用商店搜索页
  Linking.openURL('market://search?q=Immich&c=apps').catch(() => {})
}

async function openTalebook(): Promise<void> {
  for (const pkg of KNOWN_TALEBOOK_PACKAGES) {
    if (await tryLaunchTalebook(pkg)) return
  }
  // 未上架：提示 GitHub 地址，可跳转或复制
  Alert.alert(
    '未检测到 Talebook 应用',
    `该项目未上架应用商店。\n请前往 GitHub 下载安装：\n${TALEBOOK_GITHUB_URL}`,
    [
      { text: '取消', style: 'cancel' },
      { text: '复制地址', onPress: () => { void Clipboard.setStringAsync(TALEBOOK_GITHUB_URL) } },
      { text: '前往 GitHub', onPress: () => Linking.openURL(TALEBOOK_GITHUB_URL).catch(() => {}) },
    ],
  )
}

export async function launchAppWithFallback(
  serviceType: string,
  name: string,
  url: string,
): Promise<void> {
  if (serviceType === 'immich') {
    await openImmich()
    return
  }
  if (serviceType === 'talebook') {
    await openTalebook()
    return
  }

  Alert.alert(
    `Open ${name}`,
    `Launch the ${name} app?`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open in Browser', onPress: () => Linking.openURL(url) },
    ],
  )
}

export async function launchNativeApp(serviceType: string, fallbackUrl: string): Promise<void> {
  if (serviceType === 'immich') {
    await openImmich()
    return
  }
  if (serviceType === 'talebook') {
    await openTalebook()
    return
  }
  if (fallbackUrl) Linking.openURL(fallbackUrl).catch(() => {})
}