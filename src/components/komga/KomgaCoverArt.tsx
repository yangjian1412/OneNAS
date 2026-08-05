import { useState } from 'react'
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import type { KomgaServerConfig, KomgaSeries, KomgaBook } from '@/types'
import { komgaAuthHeader, komgaThumbUrl, komgaBookThumbUrl } from '@/lib/api/komga'

interface Props {
  server: KomgaServerConfig
  seriesId: string
  size?: number
}

export default function KomgaCoverArt({ server, seriesId, size = 64 }: Props) {
  const t = useTheme()
  const [failed, setFailed] = useState(false)
  const uri = komgaThumbUrl(server, seriesId)
  if (failed) {
    return (
      <View style={[styles.placeholder, { width: size, height: size * 1.4, backgroundColor: t.card }]}>
        <Icon name="fileBook" size={size * 0.5} color={t.textMuted} />
      </View>
    )
  }
  return (
    <Image
      source={{ uri, headers: komgaAuthHeader(server) }}
      style={{ width: size, height: size * 1.4, borderRadius: 6 }}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  )
}

export function KomgaBookCoverArt({ server, bookId, size = 64 }: { server: KomgaServerConfig; bookId: string; size?: number }) {
  console.log('[KBOCA] start', { hasServer: !!server, bookId, size, kThumbType: typeof komgaBookThumbUrl, kAuthType: typeof komgaAuthHeader })
  const t = useTheme()
  const [failed, setFailed] = useState(false)
  const uri = komgaBookThumbUrl(server, bookId)
  console.log('[KBOCA] uri=', uri)
  if (failed) {
    return (
      <View style={[styles.placeholder, { width: size, height: size * 1.4, backgroundColor: t.card }]}>
        <Icon name="fileBook" size={size * 0.5} color={t.textMuted} />
      </View>
    )
  }
  return (
    <Image
      source={{ uri, headers: komgaAuthHeader(server) }}
      style={{ width: size, height: size * 1.4, borderRadius: 6 }}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  )
}

interface SeriesCardProps {
  server: KomgaServerConfig
  series: KomgaSeries
  onPress: () => void
  size?: number
}

export function KomgaSeriesCard({ server, series, onPress, size = 100 }: SeriesCardProps) {
  const t = useTheme()
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <KomgaCoverArt server={server} seriesId={series.id} size={size} />
      <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{series.metadata.title || series.name}</Text>
      {series.booksCount > 0 && (
        <Text style={[styles.subtitle, { color: t.textMuted }]} numberOfLines={1}>
          {series.booksReadCount}/{series.booksCount}
        </Text>
      )}
    </TouchableOpacity>
  )
}

interface BookCardProps {
  server: KomgaServerConfig
  book: KomgaBook
  onPress: () => void
  size?: number
}

export function KomgaBookCard({ server, book, onPress, size = 90 }: BookCardProps) {
  console.log('[KBC] render', { hasServer: !!server, bookId: book?.id, hasMetadata: !!book?.metadata, onPressType: typeof onPress })
  const t = useTheme()
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <KomgaBookCoverArt server={server} bookId={book.id} size={size} />
      <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{book.metadata.title || book.name}</Text>
      {book.metadata.number && book.metadata.number !== '0' && (
        <Text style={[styles.subtitle, { color: t.textMuted }]} numberOfLines={1}>#{book.metadata.number}</Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  placeholder: {
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 100,
    marginRight: 12,
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 12, marginTop: 4, fontWeight: '600', maxWidth: 100,
  },
  subtitle: {
    fontSize: 10, marginTop: 1,
  },
})