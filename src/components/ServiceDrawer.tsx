import { useEffect, useRef, useCallback } from 'react'
import { View, Text, TouchableOpacity, Animated, Dimensions, Modal, StyleSheet, Platform, StatusBar } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Icon, { IconName } from '@/components/Icon'

export interface DrawerItem {
  key: string
  label: string
  icon?: IconName
  destructive?: boolean
  onPress: () => void
}

export interface DrawerUserInfo {
  name: string
  url?: string
  avatar?: string
}

export interface DrawerVersionInfo {
  type: string
  version?: string
}

interface Props {
  visible: boolean
  onClose: () => void
  userInfo: DrawerUserInfo
  versionInfo?: DrawerVersionInfo
  items: DrawerItem[]
  t: any
}

const DRAWER_W = Dimensions.get('window').width * 0.75

export default function ServiceDrawer({ visible, onClose, userInfo, versionInfo, items, t }: Props) {
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
  const avatarLetter = (userInfo.avatar ?? userInfo.name ?? '?').trim().charAt(0).toUpperCase() || '?'

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
              <Text style={styles.avatarText}>{avatarLetter}</Text>
            </View>
            <Text style={[styles.userName, { color: t.text }]} numberOfLines={1}>{userInfo.name}</Text>
            {userInfo.url ? (
              <Text style={[styles.serverUrl, { color: t.textMuted }]} numberOfLines={1}>{userInfo.url}</Text>
            ) : null}
          </View>

          <View style={styles.menuSection}>
            {items.map((it) => (
              <TouchableOpacity
                key={it.key}
                style={[styles.menuItem, { backgroundColor: t.inputBg }]}
                onPress={() => { handleClose(); it.onPress() }}
              >
                {it.icon ? (
                  <Icon name={it.icon} size={20} color={it.destructive ? (t.danger || '#c0392b') : t.text} />
                ) : null}
                <Text style={[styles.menuItemText, { color: it.destructive ? (t.danger || '#c0392b') : t.text }]}>
                  {it.label}
                </Text>
                <Icon name="chevronRight" size={16} color={t.textMuted} />
              </TouchableOpacity>
            ))}
          </View>

          {versionInfo ? (
            <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]}>
              <View style={[styles.divider, { backgroundColor: t.border }]} />
              <Text style={[styles.versionLabel, { color: t.textMuted }]}>服务器信息</Text>
              {versionInfo.version ? (
                <Text style={[styles.versionValue, { color: t.text }]}>版本号: {versionInfo.version}</Text>
              ) : null}
              <Text style={[styles.versionValue, { color: t.text }]}>类型: {versionInfo.type}</Text>
            </View>
          ) : null}
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
  menuItem: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 },
  menuItemText: { flex: 1, fontSize: 15, fontWeight: '500', marginLeft: 12 },
  bottomSection: { marginTop: 'auto', paddingBottom: 32 },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: 16 },
  versionLabel: { fontSize: 11, marginBottom: 4 },
  versionValue: { fontSize: 13, fontWeight: '500', marginBottom: 2 },
})