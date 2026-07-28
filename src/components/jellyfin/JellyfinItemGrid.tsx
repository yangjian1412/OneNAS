import { View, Text, TouchableOpacity, FlatList, StyleSheet, Dimensions } from 'react-native'
import type { JellyfinItem, JellyfinServerConfig } from '@/types'
import { useTheme } from '@/lib/theme'
import JellyfinPoster from './JellyfinPoster'
import Icon from '@/components/Icon'

const { width: SCREEN_W } = Dimensions.get('window')
const POSTER_W = (SCREEN_W - 32 - 12) / 3

interface Props {
  server: JellyfinServerConfig
  items: JellyfinItem[]
  onItemPress: (item: JellyfinItem) => void
  emptyText?: string
}

export default function JellyfinItemGrid({ server, items, onItemPress, emptyText = '暂无内容' }: Props) {
  const t = useTheme()
  if (!server) return null
  if (items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={[styles.empty, { color: t.textMuted }]}>{emptyText}</Text>
      </View>
    )
  }

  const renderItem = ({ item }: { item: JellyfinItem }) => (
    <TouchableOpacity
      style={[styles.card, { width: POSTER_W }]}
      activeOpacity={0.7}
      onPress={() => onItemPress(item)}
    >
      <JellyfinPoster
        server={server}
        itemId={item.Id}
        imageTags={item.ImageTags}
        imageType="Primary"
        width={POSTER_W}
        style={{ borderRadius: 8 }}
      />
      <View style={styles.badgeRow}>
        {item.UserData?.Played && (
          <View style={[styles.badge, { backgroundColor: t.success }]}>
            <Icon name="playCircle" size={12} color="#fff" />
          </View>
        )}
        {item.Type === 'Folder' && (
          <View style={[styles.badge, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
            <Icon name="folderEmpty" size={12} color="#fff" />
          </View>
        )}
      </View>
      <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>{item.Name}</Text>
      {item.ProductionYear ? (
        <Text style={[styles.meta, { color: t.textMuted }]}>{item.ProductionYear}</Text>
      ) : null}
      {item.CommunityRating ? (
        <Text style={[styles.rating, { color: t.warning }]}>★ {item.CommunityRating.toFixed(1)}</Text>
      ) : null}
    </TouchableOpacity>
  )

  return (
    <FlatList
      data={items}
      renderItem={renderItem}
      keyExtractor={(item) => item.Id}
      numColumns={3}
      contentContainerStyle={styles.list}
      columnWrapperStyle={styles.row}
    />
  )
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 12, paddingBottom: 32 },
  row: { gap: 6, marginBottom: 12 },
  card: {},
  badgeRow: {
    position: 'absolute', top: 6, right: 6, flexDirection: 'row', gap: 4,
  },
  badge: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 13, fontWeight: '500', marginTop: 6 },
  meta: { fontSize: 11, marginTop: 2 },
  rating: { fontSize: 11, marginTop: 2, fontWeight: '600' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  empty: { fontSize: 14 },
})