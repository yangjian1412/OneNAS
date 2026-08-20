import { useEffect, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet, KeyboardAvoidingView } from 'react-native'
import { useTheme } from '@/lib/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Icon from '@/components/Icon'

interface Props {
  visible: boolean
  defaultName: string
  onConfirm: (name: string) => void
  onClose: () => void
}

export default function BookmarkEditDialog({ visible, defaultName, onConfirm, onClose }: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const [name, setName] = useState(defaultName)

  useEffect(() => {
    if (visible) setName(defaultName)
  }, [visible, defaultName])

  const handleConfirm = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onConfirm(trimmed)
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <KeyboardAvoidingView
          behavior="padding"
          onStartShouldSetResponder={() => true}
        >
          <View
            style={[styles.dialog, { backgroundColor: t.card, paddingBottom: insets.bottom + 16 }]}
          >
            <Text style={[styles.title, { color: t.text }]}>添加书签</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: t.bg, color: t.text, borderColor: t.border },
              ]}
              value={name}
              onChangeText={setName}
              placeholder="输入书签名称"
              placeholderTextColor={t.textMuted}
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.buttons}>
              <TouchableOpacity style={[styles.btn, { backgroundColor: t.bg }]} onPress={onClose}>
                <Text style={[styles.btnText, { color: t.text }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: name.trim() ? t.primary : t.textMuted }]}
                onPress={handleConfirm}
                disabled={!name.trim()}
              >
                <Text style={[styles.btnText, { color: '#fff' }]}>确认</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  dialog: {
    width: '80%',
    borderRadius: 16,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '600',
  },
})
