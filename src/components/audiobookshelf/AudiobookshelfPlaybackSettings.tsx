import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, Modal, StyleSheet, Platform, StatusBar } from 'react-native'
import { useTheme } from '@/lib/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAudiobookshelfPlaybackStore, DEFAULT_PLAYBACK_PREFS } from '@/stores/audiobookshelfPlaybackStore'
import Icon from '@/components/Icon'
import DropdownOption from '../jellyfin/DropdownOption'

const SKIP_OPTIONS = [
  { label: '5 秒', value: 5 },
  { label: '10 秒', value: 10 },
  { label: '15 秒', value: 15 },
  { label: '30 秒', value: 30 },
]

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]

interface Props {
  visible: boolean
  onClose: () => void
}

export default function AudiobookshelfPlaybackSettings({ visible, onClose }: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const pt = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0
  const store = useAudiobookshelfPlaybackStore()
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    if (visible && !store.loaded) {
      void store.loadFromStorage()
    }
  }, [visible, store])

  const handleReset = async () => {
    setConfirmReset(false)
    await store.resetDefaults()
  }

  const speedOptions = SPEEDS.map((s) => ({
    label: s === 1.0 ? '正常 (1x)' : `${s}x`,
    value: s,
  }))

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: t.bg, paddingBottom: insets.bottom }]}>
        <View style={[styles.toolbar, { backgroundColor: t.card, paddingTop: pt + 8 }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="x" size={24} color={t.text} />
          </TouchableOpacity>
          <Text style={[styles.toolbarTitle, { color: t.text }]}>播放设置</Text>
          <TouchableOpacity
            onPress={() => setConfirmReset(true)}
            style={{ paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <Text style={{ color: t.primary, fontSize: 14, fontWeight: '600' }}>恢复默认</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>快进快退</Text>
          <DropdownOption
            label="快退时长"
            options={SKIP_OPTIONS}
            selected={store.skipBackSec}
            onSelect={store.setSkipBackSec}
          />
          <DropdownOption
            label="快进时长"
            options={SKIP_OPTIONS}
            selected={store.skipForwardSec}
            onSelect={store.setSkipForwardSec}
          />

          <Text style={[styles.sectionTitle, { color: t.text, marginTop: 20 }]}>播放</Text>
          <DropdownOption
            label="默认播放速度"
            options={speedOptions}
            selected={store.defaultSpeed}
            onSelect={store.setDefaultSpeed}
          />
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>

      <Modal visible={confirmReset} transparent animationType="fade" onRequestClose={() => setConfirmReset(false)}>
        <View style={[styles.confirmOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.confirmSheet, { backgroundColor: t.card }]}>
            <Text style={[styles.confirmTitle, { color: t.text }]}>恢复默认设置？</Text>
            <Text style={[styles.confirmMsg, { color: t.textMuted }]}>
              所有播放偏好将重置为默认值{'\n'}（快退 10s / 快进 10s、速度 1x）
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity onPress={() => setConfirmReset(false)} style={[styles.confirmBtn, { borderColor: t.border }]}>
                <Text style={{ color: t.text, fontSize: 14 }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleReset} style={[styles.confirmBtn, { backgroundColor: t.primary, borderColor: t.primary }]}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>确认恢复</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  closeBtn: { padding: 8 },
  toolbarTitle: { fontSize: 17, fontWeight: '700', marginLeft: 8, flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },

  confirmOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  confirmSheet: { width: '100%', borderRadius: 14, padding: 20 },
  confirmTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  confirmMsg: { fontSize: 13, marginBottom: 16, lineHeight: 18 },
  confirmActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  confirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 80,
    alignItems: 'center',
  },
})
