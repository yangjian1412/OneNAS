import { View, Text, ScrollView, TouchableOpacity } from 'react-native'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import { AudiobookshelfBookMedia, AudiobookshelfLibraryItem, AudiobookshelfServerConfig } from '@/types'
import { audiobookshelfGetCoverUrl } from '@/lib/api/audiobookshelf'

interface Props {
  server: AudiobookshelfServerConfig
  items: AudiobookshelfLibraryItem[]
  onItemPress: (item: AudiobookshelfLibraryItem) => void
}

const ITEM_W = 140
const COVER_H = 90

export default function AudiobookshelfResumeRow({ server, items, onItemPress }: Props) {
  const t = useTheme()
  if (!server || items.length === 0) return null

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Icon name="schedule" size={18} color={t.primary} />
        <Text style={[styles.title, { color: t.text }]}>继续收听</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}
            activeOpacity={0.7}
            onPress={() => onItemPress(item)}
          >
            <View style={styles.coverWrap}>
              <CoverImage uri={audiobookshelfGetCoverUrl(server, item.id, 300)} />
              <View style={styles.playOverlay}>
                <Icon name="playFilled" size={18} color="#fff" />
              </View>
            </View>
            <View style={styles.meta}>
              <Text style={[styles.itemTitle, { color: t.text }]} numberOfLines={2}>
                {getTitle(item)}
              </Text>
              <Text style={[styles.itemSub, { color: t.textMuted }]} numberOfLines={1}>
                {getAuthor(item)}
              </Text>
              {item.userMediaProgress && (
                <ProgressBar
                  progress={item.userMediaProgress.progress}
                  primaryColor={t.primary}
                  mutedColor={t.border}
                />
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )
}

function CoverImage({ uri }: { uri: string }) {
  // Lazy import to avoid breaking if Image is unavailable in some envs
  const { Image } = require('react-native')
  return (
    <Image
      source={{ uri }}
      style={styles.cover}
      resizeMode="cover"
    />
  )
}

function ProgressBar({
  progress,
  primaryColor,
  mutedColor,
}: {
  progress: number
  primaryColor: string
  mutedColor: string
}) {
  return (
    <View style={[styles.progressTrack, { backgroundColor: mutedColor }]}>
      <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(1, progress)) * 100}%`, backgroundColor: primaryColor }]} />
    </View>
  )
}

export function getTitle(item: AudiobookshelfLibraryItem): string {
  if (item.mediaType === 'book') {
    return item.media.metadata.title || ''
  }
  return item.media.metadata.title || ''
}

export function getAuthor(item: AudiobookshelfLibraryItem): string {
  if (item.mediaType === 'book') {
    return (item.media as AudiobookshelfBookMedia).metadata.authorName || ''
  }
  return (item.media as any).metadata.author || ''
}

const styles = {
  section: { marginBottom: 16 },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    marginBottom: 6,
    gap: 6,
  },
  title: { fontSize: 16, fontWeight: '600' as const },
  scroll: { paddingHorizontal: 12, gap: 10 },
  card: {
    width: ITEM_W,
    borderRadius: 8,
    overflow: 'hidden' as const,
    borderWidth: 1,
  },
  coverWrap: { width: ITEM_W, height: COVER_H, position: 'relative' as const, backgroundColor: '#888' },
  cover: { width: '100%' as const, height: '100%' as const },
  playOverlay: {
    position: 'absolute' as const,
    right: 6,
    bottom: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  meta: { padding: 8, gap: 4 },
  itemTitle: { fontSize: 13, fontWeight: '500' as const, minHeight: 32 },
  itemSub: { fontSize: 11 },
  progressTrack: { height: 3, borderRadius: 1.5, marginTop: 4 },
  progressFill: { height: '100%' as const, borderRadius: 1.5 },
}