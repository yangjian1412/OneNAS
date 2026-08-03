import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native'
import Icon from '@/components/Icon'
import { ReactNode } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

interface Props {
  visible: boolean
  onClose: () => void
  title: string
  children: ReactNode
  t: any
}

export default function FullScreenModal({ visible, onClose, title, children, t }: Props) {
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: t.bg, paddingTop: 40, paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { backgroundColor: t.headerBg, borderBottomColor: t.border }]}>
          <Text style={[styles.title, { color: t.text }]}>{title}</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="x" size={24} color={t.text} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }}>
          {children}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontWeight: '700' },
  closeBtn: { padding: 4 },
})