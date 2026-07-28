import { View, TouchableOpacity, Modal, StyleSheet, Platform, StatusBar } from 'react-native'
import { WebView } from 'react-native-webview'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'

interface Props {
  url: string
  visible: boolean
  onClose: () => void
}

export default function JellyfinWebView({ url, visible, onClose }: Props) {
  const t = useTheme()
  const pt = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        <View style={[styles.toolbar, { backgroundColor: t.card, paddingTop: pt }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Icon name="x" size={24} color={t.text} />
          </TouchableOpacity>
        </View>
        <WebView source={{ uri: url }} style={{ flex: 1 }} />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingBottom: 8,
  },
  closeBtn: { padding: 8 },
})
