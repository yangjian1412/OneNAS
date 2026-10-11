import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import type { JellyfinLibrary, JellyfinServerConfig } from '@/types'
import { useTheme } from '@/lib/theme'
import { useLayout } from '@/lib/useLayout'
import JellyfinPoster from './JellyfinPoster'

interface Props {
  server: JellyfinServerConfig
  libraries: JellyfinLibrary[]
  onLibraryPress: (lib: JellyfinLibrary) => void
}

export default function JellyfinLibraryGrid({ server, libraries, onLibraryPress }: Props) {
  const t = useTheme()
  const { width, isWide, isExpanded } = useLayout()
  // 响应式列数：宽屏并排更多媒体库卡片
  const cols = isExpanded ? 5 : isWide ? 4 : 2
  const CARD_W = Math.floor((width - 24 - (cols - 1) * 8) / cols)
  if (!server) return null
  const data = libraries.filter((l) => l.ItemId)
  if (data.length === 0) return null

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: t.text }]}>媒体库</Text>
      <View style={styles.grid}>
        {data.map((lib) => (
          <TouchableOpacity
            key={lib.ItemId}
            style={[styles.card, { width: CARD_W, backgroundColor: t.card }]}
            onPress={() => onLibraryPress(lib)}
            activeOpacity={0.7}
          >
            <JellyfinPoster
              server={server}
              itemId={lib.ItemId}
              imageTags={lib.ImageTags}
              imageType="Primary"
              width={CARD_W}
              aspectRatio={16 / 9}
              style={styles.poster}
            />
            <View style={styles.labelWrap}>
              <Text style={[styles.label, { color: t.text }]} numberOfLines={1}>{lib.Name}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 10, paddingHorizontal: 12 },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 12, gap: 8,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  poster: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  labelWrap: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
})
