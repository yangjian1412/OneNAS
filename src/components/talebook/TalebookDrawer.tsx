import { useEffect, useRef, useCallback } from 'react'
import { View, Text, TouchableOpacity, Animated, Dimensions, Modal, StyleSheet, Platform, StatusBar } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import type { TalebookServerConfig } from '@/types'
import { launchAppWithFallback } from '@/lib/android-intent'

interface Props {
  visible: boolean
  server: TalebookServerConfig | null
  serverVersion?: string
  isLoggedIn: boolean
  nickname?: string
  onClose: () => void
}

const DRAWER_W = Dimensions.get('window').width * 0.75

export default function TalebookDrawer({
  visible,
  server,
  serverVersion,
  isLoggedIn,
  nickname,
  onClose,
}: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const translateX = useRef(new Animated.Value(-DRAWER_W)).current

  useEffect(() => {
    if (visible) {
      Animated.timing(translateX, { toValue: 0, duration: 200, useNativeDriver: true }).start()
    }
  }, [visible, translateX])

  const handleClose = useCallback(() => {
    Animated.timing(translateX, { toValue: -DRAWER_W, duration: 200, useNativeDriver: true }).start(() => {
      onClose()
    })
  }, [translateX, onClose])

  const pt = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.modalContainer}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose} />
        <Animated.View style={[styles.drawer, { backgroundColor: t.card, transform: [{ translateX }], paddingTop: pt + 40 }]}>
          <View style={styles.topRow}>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.closeBtn}>
              <Text style={[styles.closeText, { color: t.textMuted }]}>关闭</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.userSection}>
            <View style={[styles.avatar, { backgroundColor: t.primary }]}>
              <Text style={styles.avatarText}>
                {(nickname || (isLoggedIn ? '?' : '·')).charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.username, { color: t.text }]} numberOfLines={1}>
              {isLoggedIn ? (nickname || '已登录') : '未登录'}
            </Text>
            <Text style={[styles.serverUrl, { color: t.textMuted }]} numberOfLines={1}>
              {server?.url || ''}
            </Text>
          </View>

          <View style={styles.menuSection}>
            <TouchableOpacity style={[styles.menuItem, { backgroundColor: t.inputBg }]} onPress={() => { handleClose(); void launchAppWithFallback('talebook', 'Talebook', server?.url ?? '') }}>
              <Icon name="compass" size={20} color={t.text} />
              <Text style={[styles.menuItemText, { color: t.text }]}>打开 Talebook 应用</Text>
              <Icon name="chevronRight" size={16} color={t.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.divider, { backgroundColor: t.border }]} />
            <View style={styles.versionRow}>
              <Text style={[styles.versionLabel, { color: t.textMuted }]}>类型</Text>
              <Text style={[styles.versionValue, { color: t.text }]}>Talebook</Text>
            </View>
            <View style={styles.versionRow}>
              <Text style={[styles.versionLabel, { color: t.textMuted }]}>服务器版本</Text>
              <Text style={[styles.versionValue, { color: t.text }]}>{serverVersion || '...'}</Text>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1, flexDirection: 'row' },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  drawer: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_W,
    paddingHorizontal: 20,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  topRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 8 },
  closeBtn: { padding: 8 },
  closeText: { fontSize: 15, fontWeight: '600' as const },
  userSection: { alignItems: 'center' as const, marginBottom: 24 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 12 },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '700' as const },
  username: { fontSize: 17, fontWeight: '700' as const },
  serverUrl: { fontSize: 12, marginTop: 4 },
  menuSection: { gap: 8, marginBottom: 24 },
  menuItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  menuItemText: { flex: 1, fontSize: 15, fontWeight: '500' as const, marginLeft: 12 },
  bottomSection: { marginTop: 'auto' as any, paddingBottom: 32 },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: 16 },
  versionRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, paddingVertical: 4 },
  versionLabel: { fontSize: 13 },
  versionValue: { fontSize: 13, fontWeight: '600' as const },
})
