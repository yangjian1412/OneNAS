import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme } from '@/lib/theme'
import type { KomgaServerConfig, KomgaSeries, KomgaBook } from '@/types'
import { KomgaSeriesCard, KomgaBookCard } from '@/components/komga/KomgaCoverArt'

interface RowItem<T> {
  key: string
  data: T
}

interface SeriesRowProps {
  title: string
  server: KomgaServerConfig
  items: KomgaSeries[]
  onItemPress: (s: KomgaSeries) => void
  rightAction?: { label: string; onPress: () => void }
}

export function KomgaSeriesRow({ title, server, items, onItemPress, rightAction }: SeriesRowProps) {
  console.log('[KSR] render title=' + JSON.stringify(title) + ' itemsType=' + typeof items + ' itemsIsArray=' + Array.isArray(items) + ' itemsLen=' + (items && items.length !== undefined ? items.length : 'undef'))
  const t = useTheme()
  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{title}</Text>
        {rightAction && (
          <TouchableOpacity onPress={rightAction.onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.rightAction, { color: t.primary }]}>{rightAction.label}</Text>
          </TouchableOpacity>
        )}
      </View>
      {items.length === 0 ? (
        <Text style={[styles.empty, { color: t.textMuted }]}>暂无内容</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {items.map((s) => (
            <KomgaSeriesCard key={s.id} server={server} series={s} onPress={() => onItemPress(s)} size={100} />
          ))}
        </ScrollView>
      )}
    </View>
  )
}

interface BookRowProps {
  title: string
  server: KomgaServerConfig
  items: KomgaBook[]
  onItemPress: (b: KomgaBook) => void
  rightAction?: { label: string; onPress: () => void }
}

export function KomgaBookRow({ title, server, items, onItemPress, rightAction }: BookRowProps) {
  console.log('[KBR] render title=' + JSON.stringify(title) + ' serverType=' + typeof server + ' itemsType=' + typeof items + ' itemsIsArray=' + Array.isArray(items) + ' itemsKeys=' + (items && typeof items === 'object' ? Object.keys(items).slice(0, 8).join(',') : 'null') + ' itemsLen=' + (items && items.length !== undefined ? items.length : 'undef'))
  const t = useTheme()
  console.log('[KBR] useTheme result', t)
  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{title}</Text>
        {rightAction && (
          <TouchableOpacity onPress={rightAction.onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.rightAction, { color: t.primary }]}>{rightAction.label}</Text>
          </TouchableOpacity>
        )}
      </View>
      {items.length === 0 ? (
        <Text style={[styles.empty, { color: t.textMuted }]}>暂无内容</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {items.map((b) => (
            <KomgaBookCard key={b.id} server={server} book={b} onPress={() => onItemPress(b)} size={90} />
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { marginBottom: 22 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 8,
  },
  title: { fontSize: 16, fontWeight: '700', flex: 1 },
  rightAction: { fontSize: 13, fontWeight: '600', marginLeft: 8 },
  scroll: { paddingHorizontal: 16, paddingRight: 32 },
  empty: { fontSize: 13, paddingHorizontal: 16 },
})