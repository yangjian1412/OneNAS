import { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import FullScreenModal from '@/components/FullScreenModal'
import { getCacheStats, getCachedBookList, clearAllCache, clearBookCache } from '@/lib/api/komgaCache'

interface Props {
  visible: boolean
  onClose: () => void
  t: any
}

interface CacheEntry {
  bookId: string
  seriesTitle: string
  bookTitle: string
  pages: number
  sizeBytes: number
  cachedAt: number
}

function formatBytes(b: number): string {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${b} B`
}

export default function KomgaCacheSettings({ visible, onClose, t }: Props) {
  const [stats, setStats] = useState<{ totalBytes: number; bookCount: number } | null>(null)
  const [list, setList] = useState<CacheEntry[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const [s, l] = await Promise.all([getCacheStats(), getCachedBookList()])
      setStats(s)
      setList(l)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (visible) void refresh()
  }, [visible])

  const handleClearAll = () => {
    Alert.alert(
      '清除全部缓存',
      '将删除所有本地缓存的章节图片，是否继续？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清除', style: 'destructive', onPress: async () => {
            await clearAllCache()
            await refresh()
          },
        },
      ],
    )
  }

  const handleClearOne = async (entry: CacheEntry) => {
    Alert.alert(
      '清除缓存',
      `删除《${entry.bookTitle}》的本地缓存？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清除', style: 'destructive', onPress: async () => {
            await clearBookCache('*', entry.bookId)
            await refresh()
          },
        },
      ],
    )
  }

  return (
    <FullScreenModal visible={visible} onClose={onClose} title="缓存管理" t={t}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* 总览 */}
        <View style={[styles.card, { backgroundColor: t.card }]}>
          <Text style={[styles.statLabel, { color: t.textMuted }]}>总占用</Text>
          <Text style={[styles.statValue, { color: t.text }]}>{stats ? formatBytes(stats.totalBytes) : '—'}</Text>
          <Text style={[styles.statSub, { color: t.textMuted }]}>缓存章节 {stats?.bookCount ?? 0} 本</Text>
          <TouchableOpacity style={[styles.dangerBtn, { backgroundColor: t.danger + '15', borderColor: t.danger }]} onPress={handleClearAll}>
            <Icon name="x" size={16} color={t.danger} />
            <Text style={[styles.dangerBtnText, { color: t.danger }]}>清除全部缓存</Text>
          </TouchableOpacity>
        </View>

        {/* 已缓存列表 */}
        <Text style={[styles.sectionTitle, { color: t.text }]}>已缓存章节</Text>
        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={t.primary} /></View>
        ) : list.length === 0 ? (
          <Text style={[styles.empty, { color: t.textMuted }]}>暂无缓存</Text>
        ) : (
          list.map((entry, idx) => (
            <View key={entry.bookId + idx} style={[styles.row, { backgroundColor: t.card, borderColor: t.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: t.text }]} numberOfLines={1}>{entry.seriesTitle}</Text>
                <Text style={[styles.rowSub, { color: t.textMuted }]} numberOfLines={1}>
                  {entry.bookTitle} · {entry.pages} 页 · {formatBytes(entry.sizeBytes)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => handleClearOne(entry)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="x" size={18} color={t.danger} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </FullScreenModal>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 16, padding: 16, borderRadius: 12,
  },
  statLabel: { fontSize: 12, fontWeight: '600' },
  statValue: { fontSize: 28, fontWeight: '800', marginTop: 4, marginBottom: 4 },
  statSub: { fontSize: 12, marginBottom: 14 },
  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1,
  },
  dangerBtnText: { fontSize: 14, fontWeight: '700' },
  sectionTitle: {
    fontSize: 14, fontWeight: '700', paddingHorizontal: 16, marginBottom: 8,
  },
  loading: { paddingVertical: 20, alignItems: 'center' },
  empty: { paddingHorizontal: 16, paddingVertical: 20, fontSize: 13, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 8, padding: 12,
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 11, marginTop: 2 },
})