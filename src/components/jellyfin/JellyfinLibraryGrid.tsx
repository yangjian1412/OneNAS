import { View, Text, TouchableOpacity, FlatList, StyleSheet, Dimensions } from 'react-native'
import type { JellyfinLibrary, JellyfinServerConfig } from '@/types'
import { useTheme } from '@/lib/theme'
import JellyfinPoster from './JellyfinPoster'

const CARD_W = (Dimensions.get('window').width - 32 - 8) / 2

interface Props {
  server: JellyfinServerConfig
  libraries: JellyfinLibrary[]
  onLibraryPress: (lib: JellyfinLibrary) => void
}

export default function JellyfinLibraryGrid({ server, libraries, onLibraryPress }: Props) {
  const t = useTheme()
  const data = libraries.filter((l) => l.ItemId)
  if (data.length === 0) return null

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: t.text }]}>媒体库</Text>
      <View style={styles.grid}>
        {data.map((lib) => (
          <TouchableOpacity
            key={lib.ItemId}
            style={[styles.card, { backgroundColor: t.card }]}
            onPress={() => onLibraryPress(lib)}
            activeOpacity={0.7}
          >
            <JellyfinPoster
              server={server}
              itemId={lib.ItemId}
              imageType="Primary"
              size="medium"
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
    width: CARD_W,
    borderRadius: 12,
    overflow: 'hidden',
  },
  poster: {
    width: CARD_W,
    height: CARD_W * 0.56,
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
