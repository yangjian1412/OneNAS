import { useEffect, useRef, useCallback } from 'react'
import { View, Text, TouchableOpacity, Animated, Dimensions, Modal, StyleSheet, Platform, StatusBar } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { JellyfinServerConfig } from '@/types'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'

interface Props {
  visible: boolean
  server: JellyfinServerConfig | null
  serverVersion?: string
  onClose: () => void
  onServerSettings: () => void
  onPlaybackSettings: () => void
}

const DRAWER_W = Dimensions.get('window').width * 0.75

export default function JellyfinDrawer({ visible, server, serverVersion, onClose, onServerSettings, onPlaybackSettings }: Props) {
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
              <Icon name="x" size={24} color={t.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.userSection}>
            <View style={[styles.avatar, { backgroundColor: t.primary }]}>
              <Text style={styles.avatarText}>
                {server?.userName?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            </View>
            <Text style={[styles.userName, { color: t.text }]}>{server?.userName || '未登录'}</Text>
            <Text style={[styles.serverUrl, { color: t.textMuted }]} numberOfLines={1}>{server?.url || ''}</Text>
          </View>

          <View style={styles.menuSection}>
            <TouchableOpacity style={[styles.menuItem, { backgroundColor: t.inputBg }]} onPress={() => { handleClose(); onPlaybackSettings() }}>
              <Icon name="settings" size={20} color={t.text} />
              <Text style={[styles.menuItemText, { color: t.text }]}>播放设置</Text>
              <Icon name="chevronRight" size={16} color={t.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { backgroundColor: t.inputBg }]} onPress={() => { handleClose(); onServerSettings() }}>
              <Icon name="server" size={20} color={t.text} />
              <Text style={[styles.menuItemText, { color: t.text }]}>服务器设置</Text>
              <Icon name="chevronRight" size={16} color={t.textMuted} />
            </TouchableOpacity>

          </View>

          <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.divider, { backgroundColor: t.border }]} />
            <View style={styles.versionRow}>
              <Text style={[styles.versionValue, { color: t.text }]}>服务器版本 {serverVersion || '...'}</Text>
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
    position: 'absolute', top: 0, left: 0, bottom: 0,
    width: DRAWER_W, paddingHorizontal: 20,
    elevation: 16, shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  closeBtn: { padding: 8 },
  userSection: { alignItems: 'center', marginBottom: 24 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  userName: { fontSize: 17, fontWeight: '700' },
  serverUrl: { fontSize: 12, marginTop: 4 },
  menuSection: { gap: 8, marginBottom: 24 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14,
  },
  menuItemText: { flex: 1, fontSize: 15, fontWeight: '500', marginLeft: 12 },
  bottomSection: { marginTop: 'auto', paddingBottom: 32 },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: 16 },
  versionRow: { alignItems: 'center', paddingVertical: 8 },
  versionValue: { fontSize: 13, fontWeight: '500' },
})
