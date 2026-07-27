import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '@/lib/theme'

export default function SplashView() {
  const t = useTheme()
  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
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