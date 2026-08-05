import { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, StyleSheet } from 'react-native'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import type { KomgaServerConfig, KomgaSeries, KomgaBook } from '@/types'
import { komgaThumbUrl, komgaBookThumbUrl, komgaGetSeriesBooks, komgaMarkRead, komgaMarkUnread } from '@/lib/api/komga'
import { komgaCacheBook, clearBookCache as utilClearBookCache } from '@/lib/api/komgaCache'

interface Props {
  server: KomgaServerConfig
  series: KomgaSeries
  onOpenBook: (book: KomgaBook) => void
}

export default function KomgaMangaDetail({ server, series, onOpenBook }: Props) {
  const t = useTheme()
  const [books, setBooks] = useState<KomgaBook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cachingBookId, setCachingBookId] = useState<string | null>(null)
  const [cacheProgress, setCacheProgress] = useState<{ current: number; total: number } | null>(null)
  const [expandedSummary, setExpandedSummary] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    komgaGetSeriesBooks(server, series.id, { size: 100, sort: 'metadata.numberSort,asc' })
      .then((res) => {
        if (cancelled) return
        setBooks(res)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e?.message ?? '加载失败')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [server, series.id])

  const summary = series.metadata?.summary ?? ''

  const handleToggleRead = async (book: KomgaBook) => {
    try {
      if (book.readProgress?.completed) {
        await komgaMarkUnread(server, book.id)
      } else {
        await komgaMarkRead(server, book.id)
      }
      const res = await komgaGetSeriesBooks(server, series.id, { size: 100, sort: 'metadata.numberSort,asc' })
      setBooks(res)
    } catch (e: any) {
      Alert.alert('操作失败', e?.message ?? '未知错误')
    }
  }

  const handleCacheBook = async (book: KomgaBook) => {
    setCachingBookId(book.id)
    setCacheProgress({ current: 0, total: 0 })
    const res = await komgaCacheBook(
      server,
      server.id,
      book.id,
      book.seriesTitle,
      book.metadata?.title || book.name,
      (current, total) => setCacheProgress({ current, total }),
    )
    setCachingBookId(null)
    setCacheProgress(null)
    if (!res.ok) Alert.alert('缓存失败', res.error ?? '未知错误')
    else Alert.alert('缓存完成', `${res.sizeBytes > 0 ? (res.sizeBytes / 1024 / 1024).toFixed(1) + ' MB' : ''}`)
  }

  const handleClearCache = async (book: KomgaBook) => {
    await utilClearBookCache(server.id, book.id)
    Alert.alert('已清除', `${book.metadata?.title || book.name} 的本地缓存已清除`)
  }

  return (
    <ScrollView style={[styles.scroll, { backgroundColor: t.bg }]} contentContainerStyle={styles.scrollContent}>
      {/* Header: cover + meta */}
      <View style={styles.headerRow}>
        <SafeImage uri={komgaThumbUrl(server, series.id)} style={styles.cover} />
        <View style={styles.headerMeta}>
          <Text style={[styles.seriesTitle, { color: t.text }]} numberOfLines={2}>
            {series.metadata?.title || series.name}
          </Text>
          {series.metadata?.authors && series.metadata.authors.length > 0 && (
            <Text style={[styles.metaText, { color: t.textMuted }]} numberOfLines={1}>
              {series.metadata.authors.map((a) => a.name).join(', ')}
            </Text>
          )}
          <Text style={[styles.metaText, { color: t.textMuted }]}>
            {series.booksCount} 章 · {series.booksReadCount} 已读
          </Text>
          {series.metadata?.status && (
            <Text style={[styles.metaText, { color: t.textMuted }]}>{series.metadata.status}</Text>
          )}
        </View>
      </View>

      {/* Summary */}
      {summary.length > 0 && (
        <TouchableOpacity onPress={() => setExpandedSummary(!expandedSummary)} activeOpacity={0.7}>
          <Text
            style={[styles.summary, { color: t.textSecondary }]}
            numberOfLines={expandedSummary ? undefined : 3}
          >
            {summary}
          </Text>
        </TouchableOpacity>
      )}

      {/* Status line */}
      {loading ? (
        <View style={styles.statusRow}>
          <ActivityIndicator color={t.primary} />
          <Text style={[styles.statusText, { color: t.textMuted }]}>加载中...</Text>
        </View>
      ) : error ? (
        <Text style={[styles.error, { color: t.danger }]}>{error}</Text>
      ) : (
        <Text style={[styles.countLine, { color: t.textMuted }]}>共 {books.length} 章</Text>
      )}

      {/* Chapter list */}
      <View style={styles.chapterList}>
        {books.map((book) => {
          const isRead = book.readProgress?.completed ?? false
          const isInProgress = !!book.readProgress && !isRead
          const isCaching = cachingBookId === book.id
          const pageNum = book.readProgress?.page ?? 0
          const totalPages = book.media?.pagesCount ?? 0
          const percent = totalPages > 0 ? ((pageNum / totalPages) * 100).toFixed(0) : '0'
          return (
            <View key={book.id} style={[styles.chapterRow, { borderBottomColor: t.border }]}>
              <TouchableOpacity
                style={styles.chapterMain}
                onPress={() => onOpenBook(book)}
                activeOpacity={0.7}
              >
                <SafeImage uri={komgaBookThumbUrl(server, book.id)} style={styles.chapterThumb} />
                <View style={styles.chapterMeta}>
                  <Text style={[styles.chapterTitle, { color: t.text }]} numberOfLines={1}>
                    {book.metadata?.number && book.metadata.number !== '0' ? `第 ${book.metadata.number} 话 ` : ''}
                    {book.metadata?.title || book.name}
                  </Text>
                  {book.metadata?.releaseDate ? (
                    <Text style={[styles.chapterSub, { color: t.textMuted }]} numberOfLines={1}>
                      {book.metadata.releaseDate.substring(0, 10)}
                    </Text>
                  ) : null}
                  <Text style={[styles.chapterSub, { color: t.textMuted }]}>{totalPages} 页</Text>
                </View>
                {isRead ? <Icon name="check" size={18} color={t.success} /> : null}
                {isInProgress ? (
                  <Text style={[styles.progress, { color: t.primary }]}>{percent}%</Text>
                ) : null}
              </TouchableOpacity>
              <View style={styles.chapterActions}>
                <TouchableOpacity
                  style={[styles.iconBtn, { borderColor: t.border }]}
                  onPress={() => handleToggleRead(book)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Icon name={isRead ? 'favoriteBorder' : 'favorite'} size={16} color={t.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconBtn, { borderColor: t.border }]}
                  onPress={() => isCaching ? undefined : handleCacheBook(book)}
                  disabled={isCaching}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Icon name="downloadCloud" size={16} color={isCaching ? t.textMuted : t.primary} />
                </TouchableOpacity>
              </View>
              {isCaching && cacheProgress ? (
                <Text style={[styles.cacheProgress, { color: t.textMuted }]}>
                  缓存中 {cacheProgress.current}/{cacheProgress.total}
                </Text>
              ) : null}
            </View>
          )
        })}
      </View>
    </ScrollView>
  )
}

// 安全 Image 组件：去掉 headers（RN 0.86 不支持），加 onError fallback
function SafeImage({ uri, style }: { uri: string; style?: any }) {
  const t = useTheme()
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <View style={[styles.placeholder, style, { backgroundColor: t.border }]}>
        <Icon name="fileBook" size={24} color={t.textMuted} />
      </View>
    )
  }
  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  headerRow: {
    flexDirection: 'row', padding: 16,
  },
  cover: {
    width: 110, height: 160, borderRadius: 8,
    backgroundColor: '#888',
  },
  headerMeta: {
    flex: 1, marginLeft: 14, justifyContent: 'center',
  },
  seriesTitle: {
    fontSize: 18, fontWeight: '700', marginBottom: 6,
  },
  metaText: {
    fontSize: 12, marginBottom: 3,
  },
  summary: {
    fontSize: 13, lineHeight: 19,
    paddingHorizontal: 16, marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8,
  },
  statusText: { marginLeft: 8, fontSize: 13 },
  error: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 13 },
  countLine: {
    paddingHorizontal: 16, paddingVertical: 8, fontSize: 12, fontWeight: '600',
  },
  chapterList: {},
  chapterRow: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chapterMain: {
    flexDirection: 'row', alignItems: 'center',
  },
  chapterThumb: {
    width: 44, height: 60, borderRadius: 4, backgroundColor: '#888',
  },
  placeholder: {
    alignItems: 'center', justifyContent: 'center',
  },
  chapterMeta: { flex: 1, marginLeft: 12 },
  chapterTitle: { fontSize: 14, fontWeight: '600' },
  chapterSub: { fontSize: 11, marginTop: 2 },
  progress: { fontSize: 11, fontWeight: '700', marginLeft: 8 },
  chapterActions: {
    flexDirection: 'row', marginTop: 8, marginLeft: 56, gap: 6,
  },
  iconBtn: {
    width: 32, height: 32, borderRadius: 6,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  cacheProgress: { marginTop: 6, marginLeft: 56, fontSize: 11 },
})