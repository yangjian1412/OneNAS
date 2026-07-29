import { Linking, Alert } from 'react-native'
import { launchApp, queryMarketApps } from './packageManager'

const KNOWN_MARKETS: Record<string, string> = {
  'com.android.vending': 'Play 商店',
  'com.huawei.appmarket': '华为商店',
  'com.xiaomi.market': '小米商店',
  'com.oppo.market': 'OPPO 商店',
  'com.bbk.appstore': 'vivo 商店',
  'com.coolapk.market': '酷安',
}

const KNOWN_IMMICH_PACKAGES = [
  'app.alextran.immich',
  'app.immich.immich',
  'app.immich',
]

async function tryLaunchImmich(pkg: string): Promise<boolean> {
  return await launchApp(pkg, '.MainActivity')
}

async function openImmich(): Promise<void> {
  for (const pkg of KNOWN_IMMICH_PACKAGES) {
    if (await tryLaunchImmich(pkg)) return
  }
  pickAppStore()
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
  if (fallbackUrl) Linking.openURL(fallbackUrl).catch(() => {})
}

async function pickAppStore(): Promise<void> {
  const markets = await queryMarketApps()
  const stores = markets
    .map((pkg) => ({ pkg, name: KNOWN_MARKETS[pkg] }))
    .filter((s) => !!s.name)

  const buttons: Array<{ text: string; onPress?: () => void; style?: 'cancel' }> = [
    { text: '取消', style: 'cancel' },
  ]
  for (const s of stores) {
    buttons.push({
      text: s.name!,
      onPress: () => Linking.openURL('market://search?q=Immich&c=apps').catch(() => {}),
    })
  }

  Alert.alert(
    '未检测到 Immich 应用',
    '请在应用商店搜索下载后打开',
    buttons,
  )
}