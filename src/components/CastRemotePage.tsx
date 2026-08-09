import { useEffect, useCallback, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, PanResponder } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Icon from '@/components/Icon'
import { useTheme } from '@/lib/theme'
import { useJellyfinCastStore } from '@/stores/jellyfinCastStore'
import { useAppStore } from '@/stores/appStore'

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export default function CastRemotePage({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const target = useJellyfinCastStore((s) => s.target)
  const itemName = useJellyfinCastStore((s) => s.itemName)
  const positionSeconds = useJellyfinCastStore((s) => s.positionSeconds)
  const itemDurationSeconds = useJellyfinCastStore((s) => s.itemDurationSeconds)
  const paused = useJellyfinCastStore((s) => s.paused)
  const error = useJellyfinCastStore((s) => s.error)
  const stopCast = useJellyfinCastStore((s) => s.stopCast)
  const unpause = useJellyfinCastStore((s) => s.unpause)
  const pause = useJellyfinCastStore((s) => s.pause)
  const seek = useJellyfinCastStore((s) => s.seek)
  const themeMode = useAppStore((s) => s.theme)
  const isDark = themeMode === 'dark' || (themeMode === 'system' && t.bg !== '#fff' && t.bg !== '#FFFFFF')

  const sliderWidthRef = useRef(0)
  const [, setSliderLayout] = useState({ width: 0 })

  const ratio = itemDurationSeconds > 0 ? Math.min(1, Math.max(0, positionSeconds / itemDurationSeconds)) : 0

  const handleStop = useCallback(async () => {
    await stopCast()
    onClose()
  }, [stopCast, onClose])

  const sliderPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const w = sliderWidthRef.current
        if (w <= 0 || itemDurationSeconds <= 0) return
        const x = Math.min(w, Math.max(0, e.nativeEvent.locationX))
        const targetSec = Math.round((x / w) * itemDurationSeconds)
        void seek(targetSec)
      },
      onPanResponderMove: (e, g) => {
        const w = sliderWidthRef.current
        if (w <= 0 || itemDurationSeconds <= 0) return
        const x = Math.min(w, Math.max(0, g.moveX - (e.nativeEvent.pageX - e.nativeEvent.locationX)))
        const targetSec = Math.round((x / w) * itemDurationSeconds)
        void seek(targetSec)
      },
    }),
  ).current

  useEffect(() => {
    void useJellyfinCastStore.getState().refresh()
  }, [])

  if (!target) return null

  return (
    <View style={[styles.container, { backgroundColor: t.bg, paddingTop: 40, paddingBottom: insets.bottom }]}>
      <View style={[styles.header, { backgroundColor: t.headerBg, borderBottomColor: t.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: t.text }]} numberOfLines={1}>
            投屏中 · {target.friendlyName || target.location}
          </Text>
          <Text style={[styles.headerSubtitle, { color: t.textMuted }]} numberOfLines={1}>
            {(target.manufacturer || 'DLNA') + (target.modelName ? ` · ${target.modelName}` : '')}
          </Text>
        </View>
        <TouchableOpacity onPress={handleStop} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ color: t.primary, fontSize: 14, fontWeight: '600' }}>退出</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: t.bg }]}>
            <Icon name="connectedTv" size={36} color={t.primary} />
          </View>
          <Text style={[styles.itemTitle, { color: t.text }]} numberOfLines={2}>
            {itemName || '未知内容'}
          </Text>
          {error ? (
            <Text style={[styles.errorText, { color: t.danger }]} numberOfLines={2}>{error}</Text>
          ) : null}
        </View>

        <View style={styles.progressWrap}>
          <View
            style={[styles.sliderTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }]}
            onLayout={(e) => {
              sliderWidthRef.current = e.nativeEvent.layout.width
              setSliderLayout({ width: e.nativeEvent.layout.width })
            }}
            {...sliderPan.panHandlers}
          >
            <View style={[styles.sliderFill, { width: `${Math.max(0.5, ratio * 100)}%`, backgroundColor: t.primary }]} />
            <View style={[styles.sliderKnob, { backgroundColor: t.primary, left: `${ratio * 100}%` }]} />
          </View>
          <View style={styles.timeRow}>
            <Text style={[styles.timeText, { color: t.textMuted }]}>{formatTime(positionSeconds)}</Text>
            <Text style={[styles.timeText, { color: t.textMuted }]}>{formatTime(itemDurationSeconds)}</Text>
          </View>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.ctrlBtn, { backgroundColor: t.primary, width: 76, height: 76, borderRadius: 38 }]}
            onPress={paused ? unpause : pause}
          >
            {paused ? (
              <Icon name="playFilled" size={36} color="#fff" />
            ) : (
              <Icon name="pause" size={36} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerSubtitle: { fontSize: 12, marginTop: 2 },
  closeBtn: { paddingHorizontal: 8 },
  body: { flex: 1, padding: 20, justifyContent: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  iconWrap: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  itemTitle: { flex: 1, fontSize: 16, fontWeight: '600' },
  errorText: { fontSize: 12, marginTop: 4 },
  progressWrap: { marginTop: 28 },
  sliderTrack: {
    height: 10,
    borderRadius: 5,
    justifyContent: 'center',
  },
  sliderFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 5 },
  sliderKnob: { position: 'absolute', top: -4, width: 18, height: 18, borderRadius: 9, marginLeft: -9 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  timeText: { fontSize: 12 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 36,
  },
  ctrlBtn: { alignItems: 'center', justifyContent: 'center' },
})