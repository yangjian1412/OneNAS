import { useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, Modal, StyleSheet, Platform, StatusBar } from 'react-native'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'

const LANGUAGES = [
  { label: '中文', value: 'chi' },
  { label: 'English', value: 'eng' },
  { label: '日本語', value: 'jpn' },
  { label: '한국어', value: 'kor' },
  { label: '关闭', value: '' },
]

const BITRATES = [
  { label: '自动', value: 0 },
  { label: '4K (120 Mbps)', value: 120000000 },
  { label: '1080p (40 Mbps)', value: 40000000 },
  { label: '1080p (20 Mbps)', value: 20000000 },
  { label: '720p (10 Mbps)', value: 10000000 },
  { label: '480p (4 Mbps)', value: 4000000 },
  { label: '360p (2 Mbps)', value: 2000000 },
]

interface Props {
  visible: boolean
  onClose: () => void
}

export default function JellyfinPlaybackSettings({ visible, onClose }: Props) {
  const t = useTheme()
  const pt = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0
  const [subtitleLang, setSubtitleLang] = useState('chi')
  const [audioLang, setAudioLang] = useState('')
  const [maxBitrate, setMaxBitrate] = useState(0)

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        <View style={[styles.toolbar, { backgroundColor: t.card, paddingTop: pt }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Icon name="x" size={24} color={t.text} />
          </TouchableOpacity>
          <Text style={[styles.toolbarTitle, { color: t.text }]}>播放设置</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>最大码率</Text>
          <View style={styles.options}>
            {BITRATES.map((b) => (
              <TouchableOpacity
                key={b.value}
                style={[styles.option, { backgroundColor: t.card, borderColor: maxBitrate === b.value ? t.primary : t.border }]}
                onPress={() => setMaxBitrate(b.value)}
              >
                <Text style={[styles.optionText, { color: t.text }]}>{b.label}</Text>
                {maxBitrate === b.value && (
                  <View style={[styles.checkDot, { backgroundColor: t.primary }]} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.sectionTitle, { color: t.text, marginTop: 24 }]}>默认字幕语言</Text>
          <View style={styles.options}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.value}
                style={[styles.option, { backgroundColor: t.card, borderColor: subtitleLang === lang.value ? t.primary : t.border }]}
                onPress={() => setSubtitleLang(lang.value)}
              >
                <Text style={[styles.optionText, { color: t.text }]}>{lang.label}</Text>
                {subtitleLang === lang.value && (
                  <View style={[styles.checkDot, { backgroundColor: t.primary }]} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.sectionTitle, { color: t.text, marginTop: 24 }]}>默认音轨语言</Text>
          <View style={styles.options}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.value}
                style={[styles.option, { backgroundColor: t.card, borderColor: audioLang === lang.value ? t.primary : t.border }]}
                onPress={() => setAudioLang(lang.value)}
              >
                <Text style={[styles.optionText, { color: t.text }]}>{lang.label}</Text>
                {audioLang === lang.value && (
                  <View style={[styles.checkDot, { backgroundColor: t.primary }]} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
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
  toolbarTitle: { fontSize: 17, fontWeight: '700', marginLeft: 8 },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 10 },
  options: { gap: 8 },
  option: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, borderWidth: 1.5,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  optionText: { flex: 1, fontSize: 15 },
  checkDot: { width: 10, height: 10, borderRadius: 5 },
})
