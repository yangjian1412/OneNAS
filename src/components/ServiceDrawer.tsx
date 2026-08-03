import { View, Text, Modal, TouchableOpacity, StyleSheet, BackHandler } from 'react-native'
import { useEffect, useRef } from 'react'
import Icon from '@/components/Icon'

export interface DrawerItem {
  key: string
  label: string
  icon?: string
  destructive?: boolean
  onPress: () => void
}

interface Props {
  visible: boolean
  onClose: () => void
  title: string
  subtitle?: string
  items: DrawerItem[]
  t: any
}

export default function ServiceDrawer({ visible, onClose, title, subtitle, items, t }: Props) {
  const lastBackRef = useRef(0)

  useEffect(() => {
    if (!visible) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const now = Date.now()
      if (now - lastBackRef.current < 2000) {
        onClose()
        return true
      }
      lastBackRef.current = now
      onClose()
      return true
    })
    return () => sub.remove()
  }, [visible, onClose])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={[styles.sheet, { backgroundColor: t.card }]}>
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: t.text }]}>{title}</Text>
              {subtitle ? <Text style={[styles.sheetSubtitle, { color: t.textMuted }]}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Icon name="x" size={22} color={t.textMuted} />
            </TouchableOpacity>
          </View>

          {items.map((it) => (
            <TouchableOpacity
              key={it.key}
              style={[styles.item, { borderColor: t.border }]}
              onPress={() => { onClose(); it.onPress() }}
            >
              {it.icon ? (
                <Icon name={it.icon} size={20} color={it.destructive ? (t.danger || '#c0392b') : t.text} />
              ) : null}
              <Text style={[styles.itemText, { color: it.destructive ? (t.danger || '#c0392b') : t.text }]}>
                {it.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 14, paddingBottom: 32 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 4, marginBottom: 8 },
  sheetTitle: { fontSize: 16, fontWeight: '700' },
  sheetSubtitle: { fontSize: 11, marginTop: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  itemText: { fontSize: 14, fontWeight: '500' },
})