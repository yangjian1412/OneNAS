import { useState, useEffect, useRef, useCallback } from 'react'
import { View, Text, Image, TouchableOpacity, Dimensions, ActivityIndicator, StyleSheet, Alert, FlatList, PanResponder, Modal, ScrollView } from 'react-native'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import { useImmersive } from '@/lib/immersive'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { KomgaServerConfig, KomgaBook, KomgaPage } from '@/types'
import { komgaAuthHeader, komgaGetBookPages, komgaPageUrl, komgaUpdateReadProgress, komgaMarkRead, komgaGetBook } from '@/lib/api/komga'
import { ensurePageCached, prefetchPage, pageLocalUri, isPageCached } from '@/lib/api/komgaCache'
import { addBookmark, getBookmarksForBook, removeBookmarkById, type KomgaLocalBookmark } from '@/lib/komgaLocal'

interface Props {
  server: KomgaServerConfig
  book: KomgaBook
  onClose: () => void
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

// 兼容默认 aspect：在拿到真实尺寸前用该比例布局
const DEFAULT_ASPECT = 0.66

function estimateHeight(aspect: number): number {
  return Math.max(200, Math.min(SCREEN_H, SCREEN_W / aspect))
}

export default function KomgaReader({ server, book, onClose }: Props) {
  const t = useTheme()
  useImmersive(true)
  const insets = useSafeAreaInsets()

  const [pages, setPages] = useState<KomgaPage[]>([])
  const [currentPage, setCurrentPage] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [showControls, setShowControls] = useState(false)
  const [currentBook, setCurrentBook] = useState<KomgaBook>(book)
  const [mode, setMode] = useState<'paged' | 'webtoon'>('paged')
  const [readingDirection, setReadingDirection] = useState<'ltr' | 'rtl'>('ltr')
  const [pageAspects, setPageAspects] = useState<Record<number, number>>({})
  const [bookmarkList, setBookmarkList] = useState<KomgaLocalBookmark[]>([])
  const [bookmarkSheetVisible, setBookmarkSheetVisible] = useState(false)
  // 翻页按键反馈：'prev' | 'next' | null（条漫模式）
  const [tappedDir, setTappedDir] = useState<'prev' | 'next' | null>(null)

  const listRef = useRef<FlatList<KomgaPage>>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sliderWidthRef = useRef(SCREEN_W)
  const tappedDirTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 条漫模式：按 pageIndex 存储实际测量高度，用于 scrollToOffset 精准跳转
  const webtoonHeightsRef = useRef<Map<number, number>>(new Map())

  // ── 加载页面列表 + 书信息 + 本地书签列表 ─────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setPages([])
    setCurrentPage(0)
    setShowControls(false)
    setPageAspects({})
    webtoonHeightsRef.current.clear()
    Promise.all([
      komgaGetBookPages(server, book.id),
      komgaGetBook(server, book.id),
      getBookmarksForBook(server.id, book.id),
    ]).then(([pageList, fresh, bms]) => {
      if (cancelled) return
      setPages(pageList)
      setCurrentBook(fresh)
      // 优先用最近的书签页，没书签才用服务端 readProgress
      const resumePage = bms.length > 0 ? Math.max(...bms.map((b) => b.page)) : (fresh.readProgress?.page ?? 1)
      setCurrentPage(resumePage)
      setBookmarkList(bms)
      setLoading(false)
    }).catch((e) => {
      if (cancelled) return
      Alert.alert('加载失败', e?.message ?? '未知错误')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [server, book.id])

  // ── 切页：保存进度 + 预读 ───────────────────────────────────────
  useEffect(() => {
    if (pages.length === 0 || loading || currentPage < 1) return
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

  // ── 跳页（paged 用 scrollToIndex；webtoon 用 scrollToOffset 精准累计偏移）──
  const goToPage = useCallback((p: number) => {
    const target = Math.max(1, Math.min(p, pages.length))
    if (mode === 'webtoon') {
      // 用累计偏移，避免 getItemLayout 在变高 item 上的累积偏移计算错误
      const idx = target - 1
      const heights = webtoonHeightsRef.current
      let offset = 0
      for (let i = 0; i < idx; i++) {
        const h = heights.get(i) ?? estimateHeight(pageAspects[i + 1] ?? DEFAULT_ASPECT)
        offset += h
      }
      listRef.current?.scrollToOffset({ offset, animated: true })
    } else {
      listRef.current?.scrollToIndex({ index: target - 1, animated: true })
    }
  }, [pages.length, mode, pageAspects])

  // 初次挂载后跳到 currentPage
  useEffect(() => {
    if (!loading && pages.length > 0 && currentPage >= 1) {
      const timer = setTimeout(() => { goToPage(currentPage) }, 80)
      return () => clearTimeout(timer)
    }
  }, [loading, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 翻页 + 按键反馈 ───────────────────────────────────────────────
  const flashTapped = useCallback((dir: 'prev' | 'next') => {
    setTappedDir(dir)
    if (tappedDirTimerRef.current) clearTimeout(tappedDirTimerRef.current)
    tappedDirTimerRef.current = setTimeout(() => setTappedDir(null), 180)
  }, [])

  const nextPage = useCallback(() => {
    flashTapped('next')
    if (currentPage < pages.length) {
      goToPage(currentPage + 1)
    } else {
      onClose()
    }
  }, [currentPage, pages.length, goToPage, onClose, flashTapped])

  const prevPage = useCallback(() => {
    flashTapped('prev')
    if (currentPage > 1) goToPage(currentPage - 1)
  }, [currentPage, goToPage, flashTapped])

  // ── 阅读方向感知的 tap 分区 ────────────────────────────────────
  const handleTap = (x: number) => {
    if (showControls) { setShowControls(false); return }
    const isPrevSideLeft = readingDirection === 'ltr'
    const inLeft = x < SCREEN_W / 3
    const inRight = x > (SCREEN_W * 2) / 3
    if (mode === 'webtoon') {
      // 条漫：左/右侧点击上下翻，中间显示菜单
      if (inLeft) { prevPage() }
      else if (inRight) { nextPage() }
      else { setShowControls(true) }
      return
    }
    if (inLeft) { isPrevSideLeft ? prevPage() : nextPage() }
    else if (inRight) { isPrevSideLeft ? nextPage() : prevPage() }
    else { setShowControls(true) }
  }

  // ── 书签：添加当前页 / 打开管理 sheet ─────────────────────────────
  const reloadBookmarks = useCallback(async () => {
    const list = await getBookmarksForBook(server.id, book.id)
    setBookmarkList(list)
  }, [server.id, book.id])

  const addBookmarkAtCurrent = async () => {
    try {
      await addBookmark(server.id, book.id, Math.max(1, currentPage))
      await reloadBookmarks()
      Alert.alert('已添加书签', '', [{ text: '好的', onPress: () => {} }])
    } catch (e: any) {
      Alert.alert('书签失败', e?.message ?? '未知错误')
    }
  }

  const removeOneBookmark = async (id: string) => {
    try {
      await removeBookmarkById(server.id, id)
      await reloadBookmarks()
    } catch (e: any) {
      Alert.alert('删除失败', e?.message ?? '未知错误')
    }
  }

  // ── 页面滑块 PanResponder（tap + 拖动 直接跳页）──────────────────
  const pageFromSlider = (x: number) => {
    const frac = Math.min(1, Math.max(0, x / Math.max(1, sliderWidthRef.current)))
    return Math.max(1, Math.round(frac * (pages.length - 1)) + 1)
  }

  const sliderResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        goToPage(pageFromSlider(e.nativeEvent.locationX))
      },
      onPanResponderMove: (e) => {
        goToPage(pageFromSlider(e.nativeEvent.locationX))
      },
    }),
  ).current

  // ── FlatList 页渲染 ─────────────────────────────────────────────
  const imgForPage = (p: KomgaPage, pageW: number, pageH: number, webMode: boolean) => {
    const useLocal = isPageCached(server.id, book.id, p.number)
    const source = useLocal ? { uri: pageLocalUri(server.id, book.id, p.number) } : { uri: komgaPageUrl(server, book.id, p.number), headers: komgaAuthHeader(server) }
    if (webMode) {
      const aspect = pageAspects[p.number] ?? DEFAULT_ASPECT
      const h = estimateHeight(aspect)
      return (
        <Image
          key={`${book.id}-${p.number}`}
          source={source}
          style={{ width: pageW, height: h }}
          resizeMode="contain"
          onLoad={(e) => {
            const { width, height } = e.nativeEvent.source
            if (width && height) {
              const realAspect = width / height
              setPageAspects((prev) => {
                if (prev[p.number] === realAspect) return prev
                return { ...prev, [p.number]: realAspect }
              })
            }
          }}
        />
      )
    }
    return (
      <Image
        key={`${book.id}-${p.number}`}
        source={source}
        style={{ width: pageW, height: pageH }}
        resizeMode="contain"
      />
    )
  }

  const renderPaged = () => (
    <FlatList
      ref={listRef}
      data={pages}
      keyExtractor={(p) => String(p.number)}
      renderItem={({ item }) => (
        <TouchableOpacity activeOpacity={1} onPress={(e) => handleTap(e.nativeEvent.locationX)} style={{ width: SCREEN_W, height: SCREEN_H, alignItems: 'center', justifyContent: 'center' }}>
          {imgForPage(item, SCREEN_W, SCREEN_H, false)}
        </TouchableOpacity>
      )}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      initialScrollIndex={Math.max(0, currentPage - 1)}
      getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
      onMomentumScrollEnd={(e) => {
        const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W)
        const np = idx + 1
        if (np !== currentPage) {
          setCurrentPage(np)
          if (np === pages.length) void komgaMarkRead(server, book.id).catch(() => {})
        }
      }}
      initialNumToRender={3}
      maxToRenderPerBatch={3}
      windowSize={5}
      extraData={book.id}
    />
  )

  const renderWebtoon = () => (
    <FlatList
      ref={listRef}
      data={pages}
      keyExtractor={(p) => String(p.number)}
      renderItem={({ item, index }) => {
        const aspect = pageAspects[item.number] ?? DEFAULT_ASPECT
        const h = estimateHeight(aspect)
        return (
          <View
            onLayout={(e) => {
              const measured = e.nativeEvent.layout.height
              if (measured > 0) {
                const prev = webtoonHeightsRef.current.get(index)
                if (prev !== measured) webtoonHeightsRef.current.set(index, measured)
              }
            }}
            style={{ width: SCREEN_W, alignItems: 'center', backgroundColor: '#000' }}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => handleTap(e.nativeEvent.locationX)}
              style={{ width: SCREEN_W, alignItems: 'center' }}
            >
              {imgForPage(item, SCREEN_W, h, true)}
            </TouchableOpacity>
          </View>
        )
      }}
      showsVerticalScrollIndicator={false}
      pagingEnabled={false}
      onScrollToIndexFailed={() => { /* 不再使用 scrollToIndex，无需处理 */ }}
      onViewableItemsChanged={({ viewableItems }) => {
        if (viewableItems.length > 0) {
          const first = viewableItems[0].item
          const np = first.number
          if (np !== currentPage) {
            setCurrentPage(np)
            if (np === pages.length) void komgaMarkRead(server, book.id).catch(() => {})
          }
        }
      }}
      viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
      extraData={book.id}
      initialNumToRender={3}
      maxToRenderPerBatch={4}
      windowSize={5}
    />
  )

  const progress = pages.length > 0 ? currentPage / pages.length : 0

  // 当前模式下前/后翻页箭头的颜色：条漫模式下被点击的那个闪主题色
  const prevColor = (mode === 'webtoon' && tappedDir === 'prev') ? t.primary : '#fff'
  const nextColor = (mode === 'webtoon' && tappedDir === 'next') ? t.primary : '#fff'
  // 模式图标颜色：条漫模式下显示主题色，翻页模式显示白色
  const modeColor = mode === 'webtoon' ? t.primary : '#fff'

  return (
    <View style={styles.root}>
      {loading || pages.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : (
        <>
          <View style={StyleSheet.absoluteFill}>
            {mode === 'paged' ? renderPaged() : renderWebtoon()}
          </View>

          {showControls && (
            <View style={styles.controlsOverlay} pointerEvents="box-none">
              {/* 顶部栏 */}
              <View style={[styles.topBar, { backgroundColor: 'rgba(0,0,0,0.75)', paddingTop: insets.top + 12 }]}>
                <View style={styles.topRow}>
                  <TouchableOpacity onPress={onClose} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="x" size={22} color="#fff" />
                  </TouchableOpacity>
                  <View style={styles.titleWrap}>
                    <Text style={styles.seriesTitle} numberOfLines={1}>{currentBook.seriesTitle}</Text>
                    <Text style={styles.chapterTitle} numberOfLines={1}>
                      {currentBook.metadata?.title || currentBook.name}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity
                      onPress={addBookmarkAtCurrent}
                      style={styles.iconBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Icon name="bookmarkAdd" size={22} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setShowControls(false); setBookmarkSheetVisible(true) }}
                      style={styles.iconBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Icon name="bookmark" size={22} color={bookmarkList.length > 0 ? t.primary : '#fff'} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.progressBg}>
                  <View style={[styles.progressFill, { backgroundColor: t.primary, width: `${progress * 100}%` }]} />
                </View>
              </View>

              {/* 底部栏 */}
              <View style={[styles.bottomBar, { backgroundColor: 'rgba(0,0,0,0.78)' }]}>
                {/* 页数进度条 */}
                <View
                  style={styles.sliderTrack}
                  onLayout={(e) => { sliderWidthRef.current = e.nativeEvent.layout.width }}
                  {...sliderResponder.panHandlers}>
                  <View style={[styles.sliderFill, { width: `${Math.max(0.5, progress * 100)}%`, backgroundColor: t.primary }]} />
                  <View style={[styles.sliderKnob, { backgroundColor: '#fff', left: `${progress * 100}%` }]} />
                </View>
                <View style={styles.pageLabelRow}>
                  <Text style={styles.pageLabel}>
                    {currentPage} / {pages.length}
                  </Text>
                </View>

                {/* 底部功能按钮 */}
                <View style={styles.bottomBtns}>
                  <TouchableOpacity onPress={() => goToPage(1)} style={styles.funcBtn}>
                    <Icon name="skipPrev" size={22} color="#fff" />
                    <Text style={styles.funcLabel}>首页</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={prevPage} style={styles.funcBtn}>
                    <Icon name="chevronLeft" size={22} color={prevColor} />
                    <Text style={styles.funcLabel}>上一页</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setMode((m) => (m === 'paged' ? 'webtoon' : 'paged'))}
                    style={styles.funcBtn}>
                    <View style={{ flexDirection: 'column', alignItems: 'center' }}>
                      <Icon name="chevronUp" size={14} color={modeColor} />
                      <Icon name="chevronDown" size={14} color={modeColor} />
                    </View>
                    <Text style={[styles.funcLabel, { color: modeColor }]}>{mode === 'paged' ? '条漫' : '翻页'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setReadingDirection((d) => (d === 'ltr' ? 'rtl' : 'ltr'))}
                    style={styles.funcBtn}>
                    <View style={{ flexDirection: 'row', gap: 0 }}>
                      <Icon name="chevronLeft" size={16} color="#fff" />
                      <Icon name="chevronRight" size={16} color="#fff" />
                    </View>
                    <Text style={styles.funcLabel}>{readingDirection === 'ltr' ? '右→左' : '左→右'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={nextPage} style={styles.funcBtn}>
                    <Icon name="chevronRight" size={22} color={nextColor} />
                    <Text style={styles.funcLabel}>下一页</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => goToPage(pages.length)} style={styles.funcBtn}>
                    <Icon name="skipNext" size={22} color="#fff" />
                    <Text style={styles.funcLabel}>末页</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* 书签管理 Sheet */}
          <Modal
            visible={bookmarkSheetVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setBookmarkSheetVisible(false)}>
            <TouchableOpacity
              style={styles.sheetOverlay}
              activeOpacity={1}
              onPress={() => setBookmarkSheetVisible(false)}>
              <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.sheetBody, { backgroundColor: t.card, paddingBottom: insets.bottom + 18 }]}>
                <View style={[styles.sheetHeader, { borderBottomColor: t.border }]}>
                  <Text style={[styles.sheetTitle, { color: t.text }]}>书签 · 共 {bookmarkList.length} 个</Text>
                  <TouchableOpacity onPress={() => setBookmarkSheetVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="x" size={22} color={t.text} />
                  </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={styles.sheetList}>
                  <TouchableOpacity
                    style={[styles.sheetRow, { borderBottomColor: t.border }]}
                    activeOpacity={0.7}
                    onPress={() => {
                      setBookmarkSheetVisible(false)
                      setTimeout(() => addBookmarkAtCurrent(), 250)
                    }}>
                    <Text style={[styles.sheetLabel, { color: t.primary }]}>
                      添加书签 · 第 {currentPage} 页
                    </Text>
                  </TouchableOpacity>
                  {bookmarkList.length === 0 && (
                    <Text style={[styles.sheetEmpty, { color: t.textMuted }]}>暂无书签</Text>
                  )}
                  {bookmarkList.map((b) => (
                    <View key={b.id} style={[styles.sheetRow, { borderBottomColor: t.border }]}>
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        activeOpacity={0.7}
                        onPress={() => {
                          goToPage(b.page)
                          setBookmarkSheetVisible(false)
                        }}>
                        <Text style={[styles.sheetLabel, { color: t.text }]}>第 {b.page} 页</Text>
                        {!!b.title && (
                          <Text style={[styles.sheetSub, { color: t.textMuted }]} numberOfLines={1}>{b.title}</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeOneBookmark(b.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
                        <Icon name="x" size={16} color="#ff6b6b" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  controlsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', zIndex: 20 },
  iconBtn: { padding: 8 },
  titleWrap: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  seriesTitle: { color: '#ccc', fontSize: 11, fontWeight: '600' },
  chapterTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 2 },
  topBar: { paddingBottom: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 6 },
  progressBg: { height: 2, width: '100%', backgroundColor: 'rgba(255,255,255,0.15)' },
  progressFill: { height: 2 },
  bottomBar: { paddingTop: 12, paddingBottom: 18, paddingHorizontal: 14, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  sliderTrack: {
    height: 24, justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, overflow: 'hidden', marginBottom: 8,
  },
  sliderFill: { height: '100%', borderRadius: 12 },
  sliderKnob: { position: 'absolute', top: 4, bottom: 4, width: 3, borderRadius: 2 },
  pageLabelRow: { alignItems: 'center', marginBottom: 6 },
  pageLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },
  bottomBtns: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  funcBtn: { alignItems: 'center', gap: 2, minWidth: 48 },
  funcLabel: { color: '#fff', fontSize: 10, marginTop: 1 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheetBody: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 8, maxHeight: '70%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetTitle: { fontSize: 16, fontWeight: '700' },
  sheetList: { paddingBottom: 12 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetLabel: { fontSize: 15, fontWeight: '600' },
  sheetSub: { fontSize: 12, marginTop: 2 },
  sheetEmpty: { paddingHorizontal: 16, paddingVertical: 18, fontSize: 13, textAlign: 'center' },
})