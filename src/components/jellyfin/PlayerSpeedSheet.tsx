import { useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, Animated, Dimensions, Modal, StyleSheet, ScrollView } from 'react-native'
import type { VideoPlayer } from 'expo-video'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]

interface Props {
  visible: boolean
  currentSpeed: number
  player: VideoPlayer | null
  onClose: () => void
}

export default function PlayerSpeedSheet({ visible, currentSpeed, player, onClose }: Props) {
  const t = useTheme()
  const translateY = useRef(new Animated.Value(300)).current

  useEffect(() => {
    if (visible) {
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }).start()
    }
  }, [visible, translateY])

  const handleClose = () => {
    Animated.timing(translateY, { toValue: 300, duration: 180, useNativeDriver: true }).start(() => {
      onClose()
    })
  }

  const pick = (speed: number) => {
    if (player) player.playbackRate = speed
    handleClose()
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.modalContainer}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose} />
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: t.card, transform: [{ translateY }] },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: t.text }]}>播放速度</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="x" size={22} color={t.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {SPEEDS.map((s) => {
              const selected = Math.abs(s - currentSpeed) < 0.01
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.row, { borderBottomColor: t.border }]}
                  activeOpacity={0.7}
                  onPress={() => pick(s)}
                >
                  <Text style={[styles.label, { color: selected ? t.primary : t.text }]}>
                    {`${s}x`}
                  </Text>
                  {selected ? <Icon name="multiSelect" size={20} color={t.primary} /> : null}
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1, justifyContent: 'flex-end' },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 28,
    maxHeight: Dimensions.get('window').height * 0.6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#888',
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '700' },
  list: { paddingHorizontal: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 16, fontWeight: '500' },
})