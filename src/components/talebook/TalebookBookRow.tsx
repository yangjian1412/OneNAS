import { ScrollView, View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native'
import { useTheme } from '@/lib/theme'
import type { TalebookBook, TalebookServerConfig } from '@/types'
import { talebookGetCoverUrl } from '@/lib/api/talebook'

interface Props {
  server: TalebookServerConfig
  books: TalebookBook[]
  onPress: (book: TalebookBook) => void
  emptyText?: string
}

export default function TalebookBookRow({ server, books, onPress, emptyText }: Props) {
  const t = useTheme()
  if (!books.length) {
    if (emptyText) {
      return <Text style={[styles.empty, { color: t.textMuted }]}>{emptyText}</Text>
    }
    return null
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {books.map((b) => (
        <BookCard key={b.id} server={server} book={b} onPress={onPress} />
      ))}
    </ScrollView>
  )
}

function BookCard({ server, book, onPress }: { server: TalebookServerConfig; book: TalebookBook; onPress: (b: TalebookBook) => void }) {
  const t = useTheme()
  const cover = talebookGetCoverUrl(server, book.cover || book.img || book.thumb, 220)
  const authors = (book.authors || []).join(' / ')
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => onPress(book)}>
      <View style={[styles.cover, { backgroundColor: t.border }]}>
        {cover ? <Image source={{ uri: cover }} style={styles.coverImg} resizeMode="cover" /> : null}
      </View>
      <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>{book.title || '无题'}</Text>
      {!!authors && <Text style={[styles.author, { color: t.textMuted }]} numberOfLines={1}>{authors}</Text>}
    </TouchableOpacity>
  )
}

const ITEM_W = 110

const styles = StyleSheet.create({
  row: { paddingHorizontal: 12, gap: 10 },
  card: { width: ITEM_W },
  cover: { width: ITEM_W, height: ITEM_W * 4 / 3, borderRadius: 8, overflow: 'hidden' },
  coverImg: { width: '100%', height: '100%' },
  title: { fontSize: 13, fontWeight: '500', marginTop: 6 },
  author: { fontSize: 11, marginTop: 2 },
  empty: { paddingHorizontal: 16, paddingVertical: 12, fontSize: 13 },
})
