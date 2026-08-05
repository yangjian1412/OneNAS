import { useState, useEffect, useRef, useCallback } from 'react'
import { View, Text, Image, TouchableOpacity, Dimensions, ActivityIndicator, StyleSheet, Alert, FlatList, StatusBar } from 'react-native'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import type { KomgaServerConfig, KomgaBook, KomgaPage } from '@/types'
import { komgaAuthHeader, komgaGetBookPages, komgaPageUrl, komgaUpdateReadProgress, komgaMarkRead, komgaGetBook } from '@/lib/api/komga'
import { ensurePageCached, prefetchPage, pageLocalUri, isPageCached } from '@/lib/api/komgaCache'

interface Props {
  server: KomgaServerConfig
  book: KomgaBook
  onClose: () => void
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

export default function KomgaReader({ server, book, onClose }: Props) {
  const t = useTheme()
  const [pages, setPages] = useState<KomgaPage[]>([])
  const [currentPage, setCurrentPage] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [showControls, setShowControls] = useState(false)
  const [currentBook, setCurrentBook] = useState<KomgaBook>(book)
  const listRef = useRef<FlatList<KomgaPage>>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 加载页面列表
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setPages([])
    setCurrentPage(0)
    setShowControls(false)
    Promise.all([
      komgaGetBookPages(server, book.id),
      komgaGetBook(server, book.id),
    ]).then(([pageList, fresh]) => {
      if (cancelled) return
      setPages(pageList)
      setCurrentBook(fresh)
      setCurrentPage(fresh.readProgress?.page ?? 1)
      setLoading(false)
    }).catch((e) => {
      if (cancelled) return
      Alert.alert('加载失败', e?.message ?? '未知错误')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [server, book.id])

  // 切页时：更新进度 + 预读
  useEffect(() => {
    if (pages.length === 0 || loading) return
    void ensurePageCached(server, server.id, book.id, currentPage)
    prefetchPage(server, server.id, book.id, currentPage + 1)
    prefetchPage(server, server.id, book.id, currentPage + 2)
    if (currentPage > 1) prefetchPage(server, server.id, book.id, currentPage - 1)

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void komgaUpdateReadProgress(server, book.id, { page: currentPage }).catch(() => {})
    }, 600)

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [currentPage, pages.length, loading])

  // 翻到最后一页 → 自动 markRead
  const onMomentumScrollEnd = useCallback((e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W)
    const newPage = idx + 1
    if (newPage !== currentPage) {
      setCurrentPage(newPage)
      if (pages.length > 0 && newPage === pages.length) {
        void komgaMarkRead(server, book.id).catch(() => {})
      }
    }
  }, [currentPage, pages.length, server, book.id])

  // tap：左 1/3 上一页，右 1/3 下一页，中间 1/3 显示/隐藏控制栏
  const handleTap = (x: number) => {
    if (showControls) {
      setShowControls(false)
      return
    }
    if (x < SCREEN_W / 3) {
      if (currentPage > 1) {
        listRef.current?.scrollToIndex({ index: currentPage - 2, animated: true })
      }
    } else if (x > (SCREEN_W * 2) / 3) {
      if (currentPage < pages.length) {
        listRef.current?.scrollToIndex({ index: currentPage, animated: true })
      } else {
        onClose()
      }
    } else {
      setShowControls(true)
    }
  }

  const pageItem = ({ item }: { item: KomgaPage }) => {
    const useLocal = isPageCached(server.id, book.id, item.number)
    const uri = useLocal
      ? pageLocalUri(server.id, book.id, item.number)
      : komgaPageUrl(server, book.id, item.number)
    return (
      <TouchableOpacity activeOpacity={1} onPress={(e) => handleTap(e.nativeEvent.locationX)} style={styles.page}>
        <Image
          key={`${book.id}-${item.number}`}
          source={useLocal ? { uri } : { uri, headers: komgaAuthHeader(server) }}
          style={styles.pageImage}
          resizeMode="contain"
        />
      </TouchableOpacity>
    )
  }

  const progress = pages.length > 0 ? currentPage / pages.length : 0

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {loading || pages.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : (
        <>
          <FlatList
            key={book.id}
            ref={listRef}
            data={pages}
            keyExtractor={(p) => String(p.number)}
            renderItem={pageItem}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.max(0, currentPage - 1)}
            getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
            onMomentumScrollEnd={onMomentumScrollEnd}
            initialNumToRender={2}
            maxToRenderPerBatch={3}
            windowSize={5}
            extraData={book.id}
          />

          {/* 控制栏 — 顶部 */}
          {showControls && (
            <View style={styles.controlsOverlay} pointerEvents="box-none">
              <View style={styles.topBar}>
                <View style={[styles.progressBg, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <View style={[styles.progressFill, { backgroundColor: t.primary, width: `${progress * 100}%` }]} />
                </View>
                <View style={styles.topRow}>
                  <TouchableOpacity onPress={onClose} style={styles.topBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Icon name="x" size={22} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.topInfo} numberOfLines={1}>
                    {currentBook.metadata?.title || currentBook.name}
                  </Text>
                  <Text style={styles.topPage}>
                    {currentPage}/{pages.length}
                  </Text>
                </View>
              </View>

              {/* 底部工具栏 */}
              <View style={styles.bottomBar}>
                <View style={styles.bottomRow}>
                  <TouchableOpacity onPress={() => {
                    if (currentPage > 1) listRef.current?.scrollToIndex({ index: 0, animated: true })
                  }} style={styles.bottomBtn}>
                    <Icon name="skipBack" size={20} color="#fff" />
                    <Text style={styles.bottomBtnText}>首页</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {
                    if (currentPage < pages.length) listRef.current?.scrollToIndex({ index: pages.length - 1, animated: true })
                  }} style={styles.bottomBtn}>
                    <Icon name="skipForward" size={20} color="#fff" />
                    <Text style={styles.bottomBtnText}>末页</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  page: { width: SCREEN_W, height: SCREEN_H, alignItems: 'center', justifyContent: 'center' },
  pageImage: { width: SCREEN_W, height: SCREEN_H },
  // 控制栏覆盖层
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    zIndex: 10,
  },
  // 顶部栏
  topBar: { paddingTop: 8 },
  progressBg: { height: 3, width: '100%' },
  progressFill: { height: 3 },
  topRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  topBtn: { padding: 6 },
  topInfo: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600', marginHorizontal: 8 },
  topPage: { color: '#fff', fontSize: 14, fontWeight: '600' },
  // 底部栏
  bottomBar: { paddingBottom: 16 },
  bottomRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 40,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  bottomBtn: { alignItems: 'center', gap: 4 },
  bottomBtnText: { color: '#fff', fontSize: 11 },
})