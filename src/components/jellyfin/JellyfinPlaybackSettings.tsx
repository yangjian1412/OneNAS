import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, Modal, StyleSheet, Platform, StatusBar, Switch } from 'react-native'
import { useTheme } from '@/lib/theme'
import { useJellyfinPlaybackStore, DEFAULT_PLAYBACK_PREFS } from '@/stores/jellyfinPlaybackStore'
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

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]

const SKIP_BACK_OPTIONS = [
  { label: '5 秒', value: 5000 },
  { label: '10 秒', value: 10000 },
  { label: '15 秒', value: 15000 },
  { label: '30 秒', value: 30000 },
  { label: '60 秒', value: 60000 },
]

const SKIP_FORWARD_OPTIONS = [
  { label: '5 秒', value: 5000 },
  { label: '10 秒', value: 10000 },
  { label: '15 秒', value: 15000 },
  { label: '30 秒', value: 30000 },
  { label: '60 秒', value: 60000 },
]

const DOUBLE_TAP_BACK_OPTIONS = [
  { label: '5 秒', value: 5000 },
  { label: '10 秒', value: 10000 },
  { label: '30 秒', value: 30000 },
]

const DOUBLE_TAP_FORWARD_OPTIONS = [
  { label: '5 秒', value: 5000 },
  { label: '10 秒', value: 10000 },
  { label: '30 秒', value: 30000 },
]

const THRESHOLD_OPTIONS = [
  { label: '5%', value: 5 },
  { label: '10%', value: 10 },
  { label: '20%', value: 20 },
]

const PLAYED_THRESHOLD_OPTIONS = [
  { label: '80%', value: 80 },
  { label: '90%', value: 90 },
  { label: '95%', value: 95 },
]

interface Props {
  visible: boolean
  onClose: () => void
}

export default function JellyfinPlaybackSettings({ visible, onClose }: Props) {
  const t = useTheme()
  const pt = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0
  const store = useJellyfinPlaybackStore()
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

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        <View style={[styles.toolbar, { backgroundColor: t.card }]}>
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
          <SectionTitle>画质 / 码率</SectionTitle>
          <OptionGroup
            options={BITRATES.map((b) => ({ label: b.label, value: b.value }))}
            selected={store.maxBitrate}
            onSelect={store.setMaxBitrate}
          />

          <SectionTitle>默认字幕语言</SectionTitle>
          <OptionGroup
            options={LANGUAGES.map((l) => ({ label: l.label, value: l.value }))}
            selected={store.defaultSubtitleLang}
            onSelect={store.setDefaultSubtitleLang}
          />

          <SectionTitle>默认音轨语言</SectionTitle>
          <OptionGroup
            options={LANGUAGES.map((l) => ({ label: l.label, value: l.value }))}
            selected={store.defaultAudioLang}
            onSelect={store.setDefaultAudioLang}
          />

          <SectionTitle>默认播放速度</SectionTitle>
          <OptionGroup
            options={SPEEDS.map((s) => ({ label: s === 1.0 ? '正常 (1x)' : `${s}x`, value: s }))}
            selected={store.defaultPlaybackSpeed}
            onSelect={store.setDefaultPlaybackSpeed}
          />

          <SectionTitle>底部 ⏪ 按钮快退时长</SectionTitle>
          <OptionGroup
            options={SKIP_BACK_OPTIONS}
            selected={store.skipBackMs}
            onSelect={store.setSkipBackMs}
          />

          <SectionTitle>底部 ⏩ 按钮快进时长</SectionTitle>
          <OptionGroup
            options={SKIP_FORWARD_OPTIONS}
            selected={store.skipForwardMs}
            onSelect={store.setSkipForwardMs}
          />

          <SectionTitle>双击左侧 20% 后退时长</SectionTitle>
          <OptionGroup
            options={DOUBLE_TAP_BACK_OPTIONS}
            selected={store.doubleTapBackMs}
            onSelect={store.setDoubleTapBackMs}
          />

          <SectionTitle>双击右侧 20% 快进时长</SectionTitle>
          <OptionGroup
            options={DOUBLE_TAP_FORWARD_OPTIONS}
            selected={store.doubleTapForwardMs}
            onSelect={store.setDoubleTapForwardMs}
          />

          <SectionTitle>双击左侧 20% 后退时长</SectionTitle>
          <OptionGroup
            options={DOUBLE_TAP_BACK_OPTIONS}
            selected={store.doubleTapBackMs}
            onSelect={store.setDoubleTapBackMs}
          />

          <SectionTitle>双击右侧 20% 快进时长</SectionTitle>
          <OptionGroup
            options={DOUBLE_TAP_FORWARD_OPTIONS}
            selected={store.doubleTapForwardMs}
            onSelect={store.setDoubleTapForwardMs}
          />

          <SectionTitle>进度阈值</SectionTitle>
          <SubText>低于「重置阈值」时观看不记录进度；高于「已播阈值」时自动标记为已观看</SubText>
          <Text style={[styles.subLabel, { color: t.textMuted }]}>低于即重置</Text>
          <OptionGroup
            options={THRESHOLD_OPTIONS}
            selected={store.resetPositionThresholdPct}
            onSelect={store.setResetPositionThresholdPct}
          />
          <Text style={[styles.subLabel, { color: t.textMuted, marginTop: 12 }]}>高于即标记已观看</Text>
          <OptionGroup
            options={PLAYED_THRESHOLD_OPTIONS}
            selected={store.markPlayedThresholdPct}
            onSelect={store.setMarkPlayedThresholdPct}
          />

          <SectionTitle>行为</SectionTitle>
          <SwitchRow
            label="自动恢复上次观看位置"
            value={store.resumeLastPosition}
            onValueChange={store.setResumeLastPosition}
          />
          <SwitchRow
            label="剧集自动连播下一集"
            value={store.autoPlayNextEpisode}
            onValueChange={store.setAutoPlayNextEpisode}
          />
          <SwitchRow
            label="默认横屏播放"
            value={store.landscapeByDefault}
            onValueChange={store.setLandscapeByDefault}
          />
          <SwitchRow
            label="使用外部播放器（仅推流）"
            value={store.useExternalPlayer}
            onValueChange={store.setUseExternalPlayer}
          />

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>

      <Modal visible={confirmReset} transparent animationType="fade" onRequestClose={() => setConfirmReset(false)}>
        <View style={[styles.confirmOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.confirmSheet, { backgroundColor: t.card }]}>
            <Text style={[styles.confirmTitle, { color: t.text }]}>恢复默认设置？</Text>
            <Text style={[styles.confirmMsg, { color: t.textMuted }]}>
              所有播放偏好将重置为默认值（{'\n'}
              最大码率自动、字幕中文、速度 1x、快退 10s / 快进 30s{'\n'}
              等)
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  const t = useTheme()
  return <Text style={[styles.sectionTitle, { color: t.text }]}>{children}</Text>
}

function SubText({ children }: { children: React.ReactNode }) {
  const t = useTheme()
  return <Text style={[styles.subText, { color: t.textMuted }]}>{children}</Text>
}

function OptionGroup({
  options,
  selected,
  onSelect,
}: {
  options: Array<{ label: string; value: number | string }>
  selected: number | string
  onSelect: (v: any) => void
}) {
  const t = useTheme()
  return (
    <View style={styles.options}>
      {options.map((opt) => {
        const isSelected = selected === opt.value
        return (
          <TouchableOpacity
            key={String(opt.value)}
            style={[
              styles.option,
              { backgroundColor: t.card, borderColor: isSelected ? t.primary : t.border },
            ]}
            activeOpacity={0.7}
            onPress={() => onSelect(opt.value)}
          >
            <Text style={[styles.optionText, { color: isSelected ? t.primary : t.text }]}>{opt.label}</Text>
            {isSelected ? <View style={[styles.checkDot, { backgroundColor: t.primary }]} /> : null}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function SwitchRow({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (v: boolean) => void }) {
  const t = useTheme()
  return (
    <View style={[styles.switchRow, { borderBottomColor: t.border }]}>
      <Text style={[styles.switchLabel, { color: t.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: t.border, true: t.primary }}
        thumbColor="#fff"
      />
    </View>
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
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 10, marginTop: 8 },
  subText: { fontSize: 12, marginBottom: 8 },
  subLabel: { fontSize: 12, marginBottom: 6 },
  options: { gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  optionText: { flex: 1, fontSize: 15 },
  checkDot: { width: 10, height: 10, borderRadius: 5 },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  switchLabel: { fontSize: 15, flex: 1, marginRight: 12 },

  confirmOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  confirmSheet: {
    width: '100%',
    borderRadius: 14,
    padding: 20,
  },
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