import { useState, useRef, useEffect } from 'react'
import { View, Text, StyleSheet, Animated, BackHandler } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useAppStore } from '@/stores/appStore'
import ServiceCard from '@/components/ServiceCard'
import JellyfinScreen from './JellyfinScreen'
import NavidromeScreen from './NavidromeScreen'
import Icon from '@/components/Icon'
import { SERVICE_TYPE_ICONS } from '@/lib/constants'
import { useTheme } from '@/lib/theme'

interface Props {
  serviceId: string | null
}

export default function ServiceScreen({ serviceId }: Props) {
  const services = useAppStore((s) => s.services)
  const service = services.find((s) => s.id === serviceId)
  const t = useTheme()

  const lastBackPressRef = useRef(0)
  const toastAnim = useRef(new Animated.Value(0)).current
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFocused = useIsFocused()
  const isFocusedRef = useRef(isFocused)
  isFocusedRef.current = isFocused

  const showToast = () => {
    Animated.timing(toastAnim, { toValue: 1, duration: 160, useNativeDriver: true }).start()
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start()
    }, 1500)
  }

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isFocusedRef.current) return false
      const now = Date.now()
      if (now - lastBackPressRef.current < 2000) {
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastAnim.setValue(0)
        return false
      }
      lastBackPressRef.current = now
      showToast()
      return true
    })
    return () => sub.remove()
  }, [])

  if (!service) {
    return (
      <View style={[styles.empty, { backgroundColor: t.bg }]}>
        <Icon name={SERVICE_TYPE_ICONS['jellyfin'] ?? 'folderEmpty'} size={64} />
        <Text style={[styles.emptyTitle, { color: t.text }]}>未配置服务</Text>
        <Text style={[styles.emptySub, { color: t.textMuted }]}>请到设置 → 标签设置 为当前标签分配一个服务</Text>
        <Animated.View pointerEvents="none" style={[styles.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}>
          <View style={[styles.toastInner, { backgroundColor: '#000' }]}>
            <Text style={styles.toastText}>再按一次退出</Text>
          </View>
        </Animated.View>
      </View>
    )
  }

  if (service.type === 'jellyfin') {
    return (
      <>
        <JellyfinScreen service={service} />
        <Animated.View pointerEvents="none" style={[styles.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}>
          <View style={[styles.toastInner, { backgroundColor: '#000' }]}>
            <Text style={styles.toastText}>再按一次退出</Text>
          </View>
        </Animated.View>
      </>
    )
  }

  if (service.type === 'navidrome') {
    return (
      <>
        <NavidromeScreen service={service} />
        <Animated.View pointerEvents="none" style={[styles.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}>
          <View style={[styles.toastInner, { backgroundColor: '#000' }]}>
            <Text style={styles.toastText}>再按一次退出</Text>
          </View>
        </Animated.View>
      </>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ServiceCard service={service} />
      <Animated.View pointerEvents="none" style={[styles.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}>
        <View style={[styles.toastInner, { backgroundColor: '#000' }]}>
          <Text style={styles.toastText}>再按一次退出</Text>
        </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyIcon: { marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 4 },
  toast: { position: 'absolute', left: 0, right: 0, bottom: 120, alignItems: 'center' },
  toastInner: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24 },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})