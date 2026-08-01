import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useAppStore } from '@/stores/appStore'
import { useTheme } from '@/lib/theme'
import TabNavigator from '@/navigation/TabNavigator'
import { pollTaskProgress } from '@/lib/downloadManager'

export default function App() {
  const init = useAppStore((s) => s.init)
  const t = useTheme()

  useEffect(() => { init() }, [init])

  useEffect(() => {
    let cancelled = false
    const timer = setInterval(async () => {
      const { downloads, updateDownload } = useAppStore.getState()
      const active = downloads.filter((task) => task.progress.status === 'pending' || task.progress.status === 'running')
      const results = await Promise.all(active.map(pollTaskProgress))
      if (!cancelled) results.forEach(updateDownload)
    }, 1500)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top', 'bottom']}>
        <StatusBar style="auto" />
        <TabNavigator />
      </SafeAreaView>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
})
