import { View, Text, ScrollView, TouchableOpacity } from 'react-native'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import { AudiobookshelfLibrary, AudiobookshelfLibraryItem, AudiobookshelfServerConfig, AudiobookshelfBookMedia } from '@/types'
import { audiobookshelfGetCoverUrl } from '@/lib/api/audiobookshelf'

interface Props {
  server: AudiobookshelfServerConfig
  library: AudiobookshelfLibrary
  items: AudiobookshelfLibraryItem[]
  onItemPress: (item: AudiobookshelfLibraryItem) => void
  onSeeAll: () => void
}

const ITEM_W = 110
const COVER_H = 110

export default function AudiobookshelfLibraryRow({
  server,
  library,
  items,
  onItemPress,
  onSeeAll,
}: Props) {
  const t = useTheme()

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Icon name={library.mediaType === 'book' ? 'fileBook' : 'volumeHigh'} size={18} color={t.primary} />
        <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
          {library.name}
        </Text>
        <TouchableOpacity onPress={onSeeAll} hitSlop={8}>
          <Text style={[styles.seeAll, { color: t.primary }]}>全部 ›</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {items.length === 0 ? (
          <View style={[styles.emptyCard, { borderColor: t.border }]}>
            <Icon name="folderEmpty" size={28} color={t.textMuted} />
            <Text style={[styles.emptyText, { color: t.textMuted }]}>暂无内容</Text>
          </View>
        ) : (
          items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => onItemPress(item)}
            >
              <View style={styles.coverWrap}>
                <CoverImage uri={audiobookshelfGetCoverUrl(server, item.id, 220)} />
              </View>
              <Text style={[styles.itemTitle, { color: t.text }]} numberOfLines={2}>
                {item.media.metadata.title || ''}
              </Text>
              <Text style={[styles.itemSub, { color: t.textMuted }]} numberOfLines={1}>
                {(item.media as AudiobookshelfBookMedia).metadata.authorName || ''}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  )
}

function CoverImage({ uri }: { uri: string }) {
  const { Image } = require('react-native')
  return <Image source={{ uri }} style={styles.cover} resizeMode="cover" />
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
  title: { flex: 1, fontSize: 16, fontWeight: '600' as const },
  seeAll: { fontSize: 12 },
  scroll: { paddingHorizontal: 12, gap: 10 },
  card: { width: ITEM_W },
  emptyCard: {
    width: 220,
    height: 110,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
  },
  emptyText: { fontSize: 12 },
  coverWrap: {
    width: ITEM_W,
    height: COVER_H,
    borderRadius: 8,
    overflow: 'hidden' as const,
    backgroundColor: '#888',
  },
  cover: { width: '100%' as const, height: '100%' as const },
  itemTitle: { fontSize: 12, fontWeight: '500' as const, marginTop: 4 },
  itemSub: { fontSize: 11 },
}