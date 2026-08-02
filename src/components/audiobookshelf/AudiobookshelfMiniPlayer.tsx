import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import { useAudiobookshelfPlayerStore } from '@/stores/audiobookshelfPlayerStore'

interface Props {
  onOpen: () => void
  onClose: () => void
}

export default function AudiobookshelfMiniPlayer({ onOpen, onClose }: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const currentItem = useAudiobookshelfPlayerStore((s) => s.currentItem)
  const titleText = useAudiobookshelfPlayerStore((s) => s.titleText)
  const authorText = useAudiobookshelfPlayerStore((s) => s.authorText)
  const coverUrl = useAudiobookshelfPlayerStore((s) => s.coverUrl)
  const playing = useAudiobookshelfPlayerStore((s) => s.playing)
  const currentTime = useAudiobookshelfPlayerStore((s) => s.currentTime)
  const duration = useAudiobookshelfPlayerStore((s) => s.duration)
  const trackIdx = useAudiobookshelfPlayerStore((s) => s.currentTrackIdx)
  const session = useAudiobookshelfPlayerStore((s) => s.session)

  if (!currentItem || !session) return null

  const tracks = session.audioTracks ?? []
  const track = tracks[trackIdx]
  const trackDur = track?.duration ?? 0
  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onOpen}
      style={[
        styles.container,
        {
          backgroundColor: t.card,
          borderTopColor: t.border,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
    >
      <View style={styles.row}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.cover} resizeMode="cover" />
        ) : (
          <View style={[styles.cover, { backgroundColor: t.border }]} />
        )}
        <View style={styles.middle}>
          <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
            {track?.title || titleText}
          </Text>
          <Text style={[styles.subtitle, { color: t.textMuted }]} numberOfLines={1}>
            {authorText || ' '}
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: t.border }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress * 100}%`, backgroundColor: t.primary },
              ]}
            />
          </View>
        </View>
        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.btn}
          onPress={() => useAudiobookshelfPlayerStore.getState().controls?.togglePlay()}
        >
          <Icon name={playing ? 'pause' : 'play'} size={26} color={t.text} />
        </TouchableOpacity>
        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.btn}
          onPress={onClose}
        >
          <Icon name="x" size={22} color={t.textMuted} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingTop: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  middle: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  btn: {
    padding: 8,
  },
})
