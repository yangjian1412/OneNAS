import { View, Text, ScrollView, StyleSheet } from 'react-native'
import type { JellyfinItem, JellyfinServerConfig } from '@/types'
import { useTheme } from '@/lib/theme'
import JellyfinItemCard from './JellyfinItemCard'

interface Props {
  server: JellyfinServerConfig
  items: JellyfinItem[]
  onItemPress: (item: JellyfinItem) => void
}

export default function JellyfinResumeRow({ server, items, onItemPress }: Props) {
  const t = useTheme()
  if (!server || items.length === 0) return null

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: t.text }]}>继续观看</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {items.map((item) => (
          <JellyfinItemCard
            key={item.Id}
            server={server}
            item={item}
            direction="horizontal"
            onPress={() => onItemPress(item)}
          />
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 10, paddingHorizontal: 12 },
  scroll: { paddingHorizontal: 12 },
})
