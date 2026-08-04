import { View, Text, StyleSheet, useColorScheme } from 'react-native'
import { useTheme } from '@/lib/theme'

export default function SplashView() {
  const t = useTheme()
  // 与原生 splash 背景色（window_background，跟随系统昼夜）对齐，避免色差闪动
  const systemDark = useColorScheme() === 'dark'
  const bg = systemDark ? '#1a1a2e' : '#ffffff'
  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.title, { color: t.primary }]}>One NAS</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
})