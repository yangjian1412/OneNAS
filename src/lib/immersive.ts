import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as NavigationBar from 'expo-navigation-bar'

export function useImmersive(active: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'android' || !active) return

    const applyHidden = () => {
      try { NavigationBar.setVisibilityAsync('hidden').catch(() => {}) } catch {}
      try { StatusBar.setHidden(true, 'fade') } catch {}
    }

    applyHidden()

    const retry = setTimeout(applyHidden, 150)

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') applyHidden()
    })

    return () => {
      clearTimeout(retry)
      sub.remove()
      try { NavigationBar.setVisibilityAsync('visible').catch(() => {}) } catch {}
      try { StatusBar.setHidden(false, 'fade') } catch {}
    }
  }, [active])
}
