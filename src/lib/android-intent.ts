import { Linking, Alert } from 'react-native'

const APP_PACKAGES: Record<string, string> = {
  immich: 'app.immich',
  jellyfin: 'org.jellyfin.mobile',
  jellyfin_tv: 'org.jellyfin.androidtv',
}

export async function launchAppWithFallback(
  serviceType: string,
  name: string,
  url: string,
): Promise<void> {
  const pkg = APP_PACKAGES[serviceType]

  if (!pkg) {
    Linking.openURL(url)
    return
  }

  Alert.alert(
    `Open ${name}`,
    `Launch the ${name} app?`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open App',
        onPress: async () => {
          try {
            const canOpen = await Linking.canOpenURL(`${pkg}://`)
            if (canOpen) {
              await Linking.openURL(`${pkg}://`)
            } else if (serviceType === 'immich') {
              openImmichStore()
            } else {
              tryNativeLaunch(pkg, url)
            }
          } catch {
            if (serviceType === 'immich') openImmichStore()
            else Linking.openURL(url)
          }
        },
      },
      ...(serviceType === 'immich'
        ? [{ text: 'Install from Google Play', onPress: openImmichStore }]
        : [{ text: 'Open in Browser', onPress: () => Linking.openURL(url) }]),
    ],
  )
}

export async function launchNativeApp(serviceType: string, fallbackUrl: string): Promise<void> {
  const pkg = APP_PACKAGES[serviceType]
  if (!pkg) {
    if (fallbackUrl) await Linking.openURL(fallbackUrl)
    return
  }

  try {
    if (await Linking.canOpenURL(`${pkg}://`)) {
      await Linking.openURL(`${pkg}://`)
    } else if (serviceType === 'immich') {
      openImmichStore()
    } else if (fallbackUrl) {
      await Linking.openURL(fallbackUrl)
    }
  } catch {
    if (serviceType === 'immich') openImmichStore()
    else if (fallbackUrl) Linking.openURL(fallbackUrl)
  }
}

function openImmichStore() {
  Linking.openURL('market://details?id=app.immich').catch(() =>
    Linking.openURL('https://play.google.com/store/apps/details?id=app.immich'),
  )
}

async function tryNativeLaunch(packageName: string, fallbackUrl: string) {
  try {
    const url = `intent://#Intent;scheme=https;package=${packageName};end`
    const supported = await Linking.canOpenURL(url)
    if (supported) {
      await Linking.openURL(url)
    } else {
      Linking.openURL(fallbackUrl)
    }
  } catch {
    Linking.openURL(fallbackUrl)
  }
}
