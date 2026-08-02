import { useMemo } from 'react'
import { View, Text, Modal, TouchableOpacity, ActivityIndicator, StyleSheet, Platform, StatusBar } from 'react-native'
import { WebView } from 'react-native-webview'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'

interface Props {
  visible: boolean
  url: string
  cookie: string
  title?: string
  onClose: () => void
}

// talebook 服务端阅读页面是浏览器端渲染 + JS 读 cookie 判登录。
// 通过 injectedJavaScriptBeforeContentLoaded 注入 document.cookie（同域），
// 关键：path=/ 且不加 Secure（http 站注入 Secure cookie 会被忽略）。
function buildCookieInjectionScript(rawCookie: string, baseUrl: string): string {
  if (!rawCookie || !baseUrl) return ''
  let host = ''
  try { host = new URL(baseUrl).host } catch { host = '' }
  // 拆 cookie 为多条
  const items = rawCookie.split(/;\s*/).filter(Boolean)
  const lines: string[] = []
  for (const item of items) {
    const eq = item.indexOf('=')
    if (eq <= 0) continue
    const name = item.slice(0, eq).trim()
    const value = item.slice(eq + 1).trim()
    if (!name) continue
    // 去除 Secure 标记（http 注入 Secure 会被忽略）
    lines.push(`document.cookie = ${JSON.stringify(name + '=' + value)} + '; path=/' + (location.protocol === 'https:' ? '; Secure' : '') + '; SameSite=Lax' + (${JSON.stringify(host)} ? '; domain=' + ${JSON.stringify(host)} : '');`)
  }
  return `(function(){${lines.join('\n')}})();`
}

export default function TalebookReaderModal({ visible, url, cookie, title, onClose }: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const pt = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0

  const cookieScript = useMemo(() => {
    if (!visible) return ''
    return buildCookieInjectionScript(cookie, url)
  }, [visible, cookie, url])

  if (!visible) return null

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.full, { backgroundColor: t.bg, paddingTop: pt }]}>
        <View style={[styles.headerBar, { backgroundColor: t.card, borderBottomColor: t.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.btn} hitSlop={8}>
            <Icon name="x" size={24} color={t.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{title || '阅读'}</Text>
          <View style={styles.btn} />
        </View>
        <WebView
          source={{ uri: url }}
          injectedJavaScriptBeforeContentLoaded={cookieScript || undefined}
          thirdPartyCookiesEnabled={false}
          sharedCookiesEnabled={false}
          domStorageEnabled
          javaScriptCanOpenWindowsAutomatically
          mixedContentMode="always"
          originWhitelist={['*']}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={t.primary} />
            </View>
          )}
          renderError={(errorName) => (
            <View style={styles.loading}>
              <Icon name="alertCircle" size={40} color="#ff6b6b" />
              <Text style={[styles.errorText, { color: t.text }]}>{errorName || '加载失败'}</Text>
              <Text style={[styles.errorHint, { color: t.textMuted }]}>请检查服务器地址、登录状态或网络。</Text>
            </View>
          )}
          style={{ flex: 1, backgroundColor: t.bg }}
        />
        <View style={{ height: insets.bottom }} />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  full: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  errorHint: { fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 24 },
})
