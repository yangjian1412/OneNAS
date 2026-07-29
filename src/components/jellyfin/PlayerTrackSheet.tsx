import { useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, Animated, Dimensions, Modal, StyleSheet, ScrollView } from 'react-native'
import type { JellyfinMediaStream } from '@/types'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'

interface Props {
  visible: boolean
  audioStreams: JellyfinMediaStream[]
  subtitleStreams: JellyfinMediaStream[]
  currentAudioIndex: number
  currentSubtitleIndex: number
  onSelectAudio: (index: number) => void
  onSelectSubtitle: (index: number) => void
  onClose: () => void
}

function describeStream(s: JellyfinMediaStream, fallbackIndex: number): string {
  const parts: string[] = []
  if (s.DisplayLanguage) parts.push(s.DisplayLanguage)
  else if (s.Language) parts.push(s.Language)
  if (s.Title) parts.push(s.Title)
  if (s.Codec) parts.push(s.Codec.toUpperCase())
  if (s.Channels && s.Channels > 0) {
    parts.push(s.Channels === 6 ? '5.1' : s.Channels === 8 ? '7.1' : `${s.Channels}ch`)
  }
  if (s.IsForced) parts.push('强制')
  if (s.IsDefault && !parts.length) parts.push('默认')
  if (!parts.length) parts.push(`轨道 ${fallbackIndex}`)
  return parts.join(' · ')
}

export default function PlayerTrackSheet({
  visible,
  audioStreams,
  subtitleStreams,
  currentAudioIndex,
  currentSubtitleIndex,
  onSelectAudio,
  onSelectSubtitle,
  onClose,
}: Props) {
  const t = useTheme()
  const translateY = useRef(new Animated.Value(400)).current

  useEffect(() => {
    if (visible) {
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }).start()
    }
  }, [visible, translateY])

  const handleClose = () => {
    Animated.timing(translateY, { toValue: 400, duration: 180, useNativeDriver: true }).start(() => {
      onClose()
    })
  }

  const pickAudio = (index: number) => {
    onSelectAudio(index)
    handleClose()
  }
  const pickSubtitle = (index: number) => {
    onSelectSubtitle(index)
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
            <Text style={[styles.title, { color: t.text }]}>音轨 / 字幕</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="x" size={22} color={t.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {audioStreams.length > 0 && (
              <>
                <Text style={[styles.section, { color: t.textMuted }]}>音轨</Text>
                {audioStreams.map((s, i) => {
                  const selected = currentAudioIndex === s.Index
                  return (
                    <TouchableOpacity
                      key={`audio-${s.Index}`}
                      style={[styles.row, { borderBottomColor: t.border }]}
                      activeOpacity={0.7}
                      onPress={() => pickAudio(s.Index)}
                    >
                      <Text
                        style={[styles.label, { color: selected ? t.primary : t.text }]}
                        numberOfLines={1}
                      >
                        {describeStream(s, i + 1)}
                      </Text>
                      {selected ? <Icon name="multiSelect" size={20} color={t.primary} /> : null}
                    </TouchableOpacity>
                  )
                })}
              </>
            )}

            {subtitleStreams.length > 0 && (
              <>
                <Text style={[styles.section, { color: t.textMuted, marginTop: 16 }]}>字幕</Text>
                <TouchableOpacity
                  style={[styles.row, { borderBottomColor: t.border }]}
                  activeOpacity={0.7}
                  onPress={() => pickSubtitle(-1)}
                >
                  <Text
                    style={[styles.label, { color: currentSubtitleIndex === -1 ? t.primary : t.text }]}
                  >
                    关闭
                  </Text>
                  {currentSubtitleIndex === -1 ? <Icon name="multiSelect" size={20} color={t.primary} /> : null}
                </TouchableOpacity>
                {subtitleStreams.map((s, i) => {
                  const selected = currentSubtitleIndex === s.Index
                  return (
                    <TouchableOpacity
                      key={`sub-${s.Index}`}
                      style={[styles.row, { borderBottomColor: t.border }]}
                      activeOpacity={0.7}
                      onPress={() => pickSubtitle(s.Index)}
                    >
                      <Text
                        style={[styles.label, { color: selected ? t.primary : t.text }]}
                        numberOfLines={1}
                      >
                        {describeStream(s, i + 1)}
                      </Text>
                      {selected ? <Icon name="multiSelect" size={20} color={t.primary} /> : null}
                    </TouchableOpacity>
                  )
                })}
              </>
            )}

            {audioStreams.length === 0 && subtitleStreams.length === 0 && (
              <Text style={[styles.empty, { color: t.textMuted }]}>没有可选音轨 / 字幕</Text>
            )}
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
    maxHeight: Dimensions.get('window').height * 0.7,
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
  list: { paddingHorizontal: 8, paddingBottom: 16 },
  section: { fontSize: 12, fontWeight: '600', paddingHorizontal: 12, paddingVertical: 6, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 16, fontWeight: '500', flex: 1, marginRight: 12 },
  empty: { fontSize: 14, textAlign: 'center', paddingVertical: 32 },
})