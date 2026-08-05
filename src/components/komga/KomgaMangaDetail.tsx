import { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, StyleSheet } from 'react-native'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import type { KomgaServerConfig, KomgaSeries, KomgaBook } from '@/types'
import { komgaThumbUrl, komgaBookThumbUrl, komgaGetSeriesBooks } from '@/lib/api/komga'
import { cacheBook as utilCacheBook, cacheSeries as utilCacheSeries } from '@/lib/api/komgaCache'

interface Props {
  server: KomgaServerConfig
  series: KomgaSeries
  onOpenBook: (book: KomgaBook) => void
  fav?: boolean
  onToggleFav?: () => void
  onCacheDone?: () => void
}

export default function KomgaMangaDetail({ server, series, onOpenBook, fav = false, onToggleFav, onCacheDone }: Props) {
  const t = useTheme()
  const [books, setBooks] = useState<KomgaBook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cachingBookId, setCachingBookId] = useState<string | null>(null)
  const [cachingSeries, setCachingSeries] = useState(false)
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

  const handleCacheBook = async (book: KomgaBook) => {
    setCachingBookId(book.id)
    setCacheProgress({ current: 0, total: 0 })
    const res = await utilCacheBook(
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
    onCacheDone?.()
  }

  const handleCacheSeries = async () => {
    if (cachingSeries) return
    setCachingSeries(true)
    setCacheProgress({ current: 0, total: 0 })
    const res = await utilCacheSeries(
      server,
      server.id,
      series,
      (current, total) => setCacheProgress({ current, total }),
    )
    setCachingSeries(false)
    setCacheProgress(null)
    if (!res.ok) Alert.alert('缓存失败', res.error ?? '未知错误')
    else Alert.alert('缓存完成', `${series.metadata?.title || series.name} 已缓存 ${res.books} 章${res.sizeBytes > 0 ? '，' + (res.sizeBytes / 1024 / 1024).toFixed(1) + ' MB' : ''}`)
    onCacheDone?.()
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
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.headerAction, { backgroundColor: t.card, borderColor: t.border }]}
              onPress={onToggleFav}
              activeOpacity={0.7}
            >
              <Icon name={fav ? 'favorite' : 'favoriteBorder'} size={15} color={fav ? t.danger : t.textSecondary} />
              <Text style={[styles.headerActionText, { color: fav ? t.danger : t.textSecondary }]}>
                {fav ? '已收藏' : '加入书架'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerAction, { backgroundColor: t.card, borderColor: t.border }]}
              onPress={handleCacheSeries}
              disabled={cachingSeries}
              activeOpacity={0.7}
            >
              <Icon name={cachingSeries ? 'refresh' : 'downloadRounded'} size={15} color={cachingSeries ? t.textMuted : t.primary} />
              <Text style={[styles.headerActionText, { color: cachingSeries ? t.textMuted : t.primary }]}>
                {cachingSeries ? '缓存中' : '缓存整本'}
              </Text>
            </TouchableOpacity>
          </View>
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
            <View key={book.id} style={styles.chapterWrap}>
              <View style={[styles.chapterRow, { borderBottomColor: t.border }]}>
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
                </TouchableOpacity>
                {/* 右侧：状态在上，下载图标在下方，不撑高主行 */}
                <View style={styles.chapterSide}>
                  {isRead ? <Icon name="check" size={16} color={t.success} /> : null}
                  {isInProgress ? (
                    <Text style={[styles.progress, { color: t.primary }]}>{percent}%</Text>
                  ) : null}
                  <View style={styles.chapterActions}>
                    {isCaching ? (
                      <Text style={[styles.progress, { color: t.textMuted }]}>缓存中</Text>
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleCacheBook(book)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Icon name="downloadRounded" size={17} color={t.primary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
              {isCaching && cacheProgress ? (
                <Text style={[styles.cacheProgress, { color: t.textMuted }]}>
                  {cacheProgress.current}/{cacheProgress.total}
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
  headerActions: {
    flexDirection: 'row', marginTop: 8, gap: 8,
  },
  headerAction: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 6, borderWidth: StyleSheet.hairlineWidth,
  },
  headerActionText: { fontSize: 12, fontWeight: '600' },
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
  chapterWrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  chapterRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  chapterMain: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
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
  progress: { fontSize: 11, fontWeight: '700' },
  // 右侧列：状态(百分比/已读)在上，操作图标在下，总高=封面高
  chapterSide: {
    alignItems: 'flex-end', justifyContent: 'center',
    marginLeft: 12, gap: 5,
  },
  chapterActions: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
  },
  cacheProgress: { marginLeft: 72, fontSize: 11, paddingBottom: 6 },
})