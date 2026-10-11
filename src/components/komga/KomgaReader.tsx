import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { View, Text, Image, TouchableOpacity, useWindowDimensions, ActivityIndicator, StyleSheet, Alert, FlatList, PanResponder, Modal, ScrollView } from 'react-native'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import { useImmersive } from '@/lib/immersive'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { KomgaServerConfig, KomgaBook, KomgaPage } from '@/types'
import { komgaAuthHeader, komgaGetBookPages, komgaPageUrl, komgaUpdateReadProgress, komgaMarkRead, komgaGetBook } from '@/lib/api/komga'
import { ensurePageCached, prefetchPage, pageLocalUri, isPageCached } from '@/lib/api/komgaCache'
import { addBookmark, getBookmarksForBook, removeBookmarkById, getReaderPrefs, setReaderPrefs, type KomgaLocalBookmark } from '@/lib/komgaLocal'

interface Props {
  server: KomgaServerConfig
  book: KomgaBook
  onClose: () => void
}

// 中间翻页带：x 中央 1/3
const SIDE_RATIO = 1 / 3
// 预读后续页数
const PREFETCH_AHEAD = 5
// 条漫默认 aspect（在拿到真实尺寸前用）
const DEFAULT_ASPECT = 0.65

type ReaderMode = 'paged' | 'webtoon'

export default function KomgaReader({ server, book, onClose }: Props) {
  const t = useTheme()
  useImmersive(true)
  const insets = useSafeAreaInsets()

  // 视口尺寸必须是响应式的：平板/折叠屏/分屏下窗口会被 resize，
  // 模块级 Dimensions 快照会导致翻页步长与真实容器宽度不一致（一次滑动跨多页、底部裁切）。
  const { width: winW, height: winH } = useWindowDimensions()
  const viewportW = Math.max(1, winW - insets.left - insets.right)
  const viewportH = Math.max(1, winH - insets.top - insets.bottom)
  // 供 getItemLayout / scroll 回调读取最新宽度（避免闭包拿到旧值）
  const pageWRef = useRef(viewportW)
  pageWRef.current = viewportW

  const [pages, setPages] = useState<KomgaPage[]>([])
  const [currentPage, setCurrentPage] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [showControls, setShowControls] = useState(false)
  const [currentBook, setCurrentBook] = useState<KomgaBook>(book)
  const [mode, setMode] = useState<ReaderMode>('paged')
  const [readingDirection, setReadingDirection] = useState<'ltr' | 'rtl'>('ltr')
  // 两个 FlatList 按 mode 条件渲染且 key 不同（paged-<dir> / webtoon），
  // 切模式时天然卸载重建，不需要 reloadKey 强制重载
  const [bookmarkList, setBookmarkList] = useState<KomgaLocalBookmark[]>([])
  const [bookmarkSheetVisible, setBookmarkSheetVisible] = useState(false)
  const [bookmarkAddedSheetVisible, setBookmarkAddedSheetVisible] = useState(false)

  const listRef = useRef<FlatList<KomgaPage>>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sliderWidthRef = useRef(viewportW)
  // 条漫模式：当前 scroll offset，用于 prev/nextPage 滚一屏
  const scrollOffsetRef = useRef(0)

  // ── 加载页面列表 + 书信息 + 本地书签 + 阅读偏好 ─────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setPages([])
    setCurrentPage(0)
    setShowControls(false)
    scrollOffsetRef.current = 0
    Promise.all([
      komgaGetBookPages(server, book.id),
      komgaGetBook(server, book.id),
      getBookmarksForBook(server.id, book.id),
      getReaderPrefs(server.id),
    ]).then(([pageList, fresh, bms, prefs]) => {
      if (cancelled) return
      setPages(pageList)
      setCurrentBook(fresh)
      const resumePage = bms.length > 0 ? Math.max(...bms.map((b) => b.page)) : (fresh.readProgress?.page ?? 1)
      setCurrentPage(resumePage)
      setBookmarkList(bms)
      setMode(prefs.mode)
      setReadingDirection(prefs.direction)
      setLoading(false)
    }).catch((e) => {
      if (cancelled) return
      Alert.alert('加载失败', e?.message ?? '未知错误')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [server, book.id])

  // 持久化 mode + direction
  useEffect(() => {
    if (loading) return
    void setReaderPrefs(server.id, { mode, direction: readingDirection })
  }, [mode, readingDirection, server.id, loading])

  // ── 切页：保存进度 + 预读后5页 ───────────────────────────────
  useEffect(() => {
    if (pages.length === 0 || loading || currentPage < 1) return
    void ensurePageCached(server, server.id, book.id, currentPage)
    for (let i = 1; i <= PREFETCH_AHEAD; i++) {
      prefetchPage(server, server.id, book.id, currentPage + i)
    }
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

  // ── 条漫精确布局：用服务端返回的每页宽高直接算高度与累计偏移 ──────────
  // 之前依赖 onLayout 边渲染边测量，而 FlatList 只渲染视口附近几个 item，
  // 未渲染页高度被当成 0，导致偏移错位、跳页落点错误、页码判定区间落空。
  // 服务端 PageDto 自带 width/height，因此可以开屏即算出全部页的精确位置。
  const webtoonLayout = useMemo(() => {
    const n = pages.length
    const heights = new Array<number>(n)
    const offsets = new Array<number>(n + 1)
    const knownAspects: number[] = []
    for (const p of pages) {
      if (p.width && p.height && p.width > 0 && p.height > 0) knownAspects.push(p.width / p.height)
    }
    // 缺尺寸的页用已知页的中位比例兜底；全都没有才用默认值
    const fallbackAspect = knownAspects.length > 0
      ? knownAspects.slice().sort((a, b) => a - b)[Math.floor(knownAspects.length / 2)]
      : DEFAULT_ASPECT
    offsets[0] = 0
    for (let i = 0; i < n; i++) {
      const p = pages[i]
      const aspect = p.width && p.height && p.width > 0 && p.height > 0 ? p.width / p.height : fallbackAspect
      heights[i] = aspect > 0 ? viewportW / aspect : viewportW / DEFAULT_ASPECT
      offsets[i + 1] = offsets[i] + heights[i]
    }
    return { heights, offsets, total: offsets[n] ?? 0 }
  }, [pages, viewportW])

  // 偏移 → 页码：二分查找「起始位置 <= scrollY 的最后一页」。
  // 按视口顶部锚定，比屏幕高的长图停在中间也只归属它自己那一页。
  const pageFromOffset = useCallback((offsetY: number) => {
    const offs = webtoonLayout.offsets
    const last = pages.length - 1
    if (last < 0) return 0
    const y = Math.max(0, offsetY)
    let lo = 0
    let hi = last
    let idx = 0
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (offs[mid] <= y) {
        idx = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return idx + 1
  }, [webtoonLayout.offsets, pages.length])

  // ── 视口变化（旋转/分屏/折叠展开）后回到同一页 ────────────────────
  // 尺寸变了但 contentOffset 不变会让用户停在半页上，这里按新步长重新对齐。
  const prevViewportRef = useRef({ w: viewportW, h: viewportH })
  useEffect(() => {
    const prev = prevViewportRef.current
    if (prev.w === viewportW && prev.h === viewportH) return
    prevViewportRef.current = { w: viewportW, h: viewportH }
    if (pages.length === 0) return
    const target = Math.max(0, Math.min(currentPage - 1, pages.length - 1))
    requestAnimationFrame(() => {
      if (mode === 'webtoon') {
        listRef.current?.scrollToOffset({ offset: webtoonLayout.offsets[target] ?? 0, animated: false })
      } else {
        listRef.current?.scrollToOffset({ offset: target * viewportW, animated: false })
      }
    })
  }, [viewportW, viewportH, mode, currentPage, pages.length, webtoonLayout.offsets])

  // ── 跳页 ────────────────────────────────────────────────────────
  // 两种模式都有精确布局，统一走 scrollToIndex；条漫由 getItemLayout 提供偏移。
  const goToPage = useCallback((p: number) => {
    const target = Math.max(1, Math.min(p, pages.length))
    listRef.current?.scrollToIndex({ index: target - 1, animated: true })
  }, [pages.length])

  // ── 翻页 ──────────────────────────────────────────────────────
  // paged: 跳到对应页（FlatList 自动对齐到页边界）
  // webtoon: 滚动一屏（用 scrollOffsetRef 实时位置 + 精确总高做上限）
  const nextPage = useCallback(() => {
    if (mode === 'webtoon') {
      const maxOffset = Math.max(0, webtoonLayout.total - viewportH)
      const target = Math.min(maxOffset, scrollOffsetRef.current + viewportH)
      scrollOffsetRef.current = target
      listRef.current?.scrollToOffset({ offset: target, animated: true })
    } else if (currentPage < pages.length) {
      goToPage(currentPage + 1)
    } else {
      onClose()
    }
  }, [currentPage, pages.length, goToPage, onClose, mode, viewportH, webtoonLayout.total])

  const prevPage = useCallback(() => {
    if (mode === 'webtoon') {
      const target = Math.max(0, scrollOffsetRef.current - viewportH)
      scrollOffsetRef.current = target
      listRef.current?.scrollToOffset({ offset: target, animated: true })
    } else if (currentPage > 1) {
      goToPage(currentPage - 1)
    }
  }, [currentPage, goToPage, mode, viewportH])

  // ── 反L 9 区 tap ────────────────────────────────────────────────
  // 用 pageX/pageY（相对根视图）而不是 locationX/locationY（相对被点中的元素）：
  // 条漫模式里每个 item 只是「那一页图片」并随滚动偏移，用 locationY 会把
  // 「图片中点」当成屏幕中点，导致菜单唤出位置跟着图片跑。
  const handleTap = (pageX: number, pageY: number) => {
    if (showControls) { setShowControls(false); return }
    const centerY = viewportH / 2
    const centerYTop = viewportH * 0.25
    const centerYBottom = viewportH * 0.75
    const inLeftSide = pageX < viewportW * SIDE_RATIO
    const inRightSide = pageX > viewportW * (1 - SIDE_RATIO)
    const inCenterX = !inLeftSide && !inRightSide
    const isCenterMenu = inCenterX && pageY >= centerYTop && pageY <= centerYBottom

    if (isCenterMenu) {
      setShowControls(true)
      return
    }

    let goPrev = false
    if (mode === 'webtoon') {
      // 条漫：上半屏往上翻、下半屏往下翻
      goPrev = inLeftSide || (inCenterX && pageY < centerY)
    } else {
      const goLeft = inLeftSide || (inCenterX && pageY < centerY)
      goPrev = readingDirection === 'ltr' ? goLeft : !goLeft
    }

    if (goPrev) prevPage()
    else nextPage()
  }

  // ── 切换阅读模式/方向（3 态循环：向右翻页 → 向左翻页 → 翻页模式）───
  // FlatList 按 mode 条件渲染且 key 不同，切模式时天然卸载重建，
  // 无需 reloadKey 强制重载（旧实现重载会从 AsyncStorage 读回旧 mode，与写入竞态，
  // 导致切到条漫后又被翻回普通翻页）。
  const cycleMode = useCallback(() => {
    if (currentPage >= 1) {
      void komgaUpdateReadProgress(server, book.id, { page: currentPage }).catch(() => {})
    }
    if (mode === 'webtoon') {
      setMode('paged')
      setReadingDirection('ltr')
    } else if (readingDirection === 'ltr') {
      setReadingDirection('rtl')
    } else {
      setMode('webtoon')
    }
  }, [mode, readingDirection, currentPage, server, book.id])

  // ── 书签 ────────────────────────────────────────────────────────
  const reloadBookmarks = useCallback(async () => {
    const list = await getBookmarksForBook(server.id, book.id)
    setBookmarkList(list)
  }, [server.id, book.id])

  const addBookmarkAtCurrent = async () => {
    try {
      await addBookmark(server.id, book.id, Math.max(1, currentPage))
      await reloadBookmarks()
      setBookmarkAddedSheetVisible(true)
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

  // ── 进度条 PanResponder ───────────────────────────────────────────
  const pageFromSlider = (x: number, width?: number) => {
    const w = width ?? sliderWidthRef.current
    if (w <= 0) return 1
    const frac = Math.min(1, Math.max(0, x / w))
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

  // ── paged FlatList ───────────────────────────────────────────────
  const renderPaged = () => {
    const isRtl = readingDirection === 'rtl'
    const pagedW = pageWRef.current
    return (
      <FlatList
        key={`paged-${readingDirection}`}
        ref={listRef}
        data={pages}
        keyExtractor={(p) => String(p.number)}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => handleTap(e.nativeEvent.pageX, e.nativeEvent.pageY)}
            style={{ width: viewportW, height: viewportH, alignItems: 'center', justifyContent: 'center' }}>
            <Image
              source={isPageCached(server.id, book.id, item.number)
                ? { uri: pageLocalUri(server.id, book.id, item.number) }
                : { uri: komgaPageUrl(server, book.id, item.number), headers: komgaAuthHeader(server) }}
              style={{ width: viewportW, height: viewportH }}
              resizeMode="contain"
            />
          </TouchableOpacity>
        )}
        horizontal
        inverted={isRtl}
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={Math.max(0, currentPage - 1)}
        getItemLayout={(_, index) => ({ length: pagedW, offset: pagedW * index, index })}
        onMomentumScrollEnd={(e) => {
          const stride = pageWRef.current
          const idx = Math.round(e.nativeEvent.contentOffset.x / stride)
          const np = idx + 1
          if (np !== currentPage) {
            setCurrentPage(np)
            if (np === pages.length) void komgaMarkRead(server, book.id).catch(() => {})
          }
        }}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          // 目标 index 还没渲染完时兜底：用 scrollToOffset 近似
          const offset = Math.max(0, averageItemLength * index)
          setTimeout(() => {
            listRef.current?.scrollToOffset({ offset, animated: false })
          }, 100)
        }}
        initialNumToRender={5}
        maxToRenderPerBatch={3}
        windowSize={5}
        extraData={book.id}
      />
    )
  }

  // ── webtoon FlatList：item 紧贴、image 填宽，按真实 aspect 自适应高 ──
  const renderWebtoon = () => (
    <FlatList
      key="webtoon"
      ref={listRef}
      data={pages}
      keyExtractor={(p) => String(p.number)}
      initialScrollIndex={Math.max(0, currentPage - 1)}
      getItemLayout={(_, index) => ({
        length: webtoonLayout.heights[index] ?? 0,
        offset: webtoonLayout.offsets[index] ?? 0,
        index,
      })}
      onScrollToIndexFailed={({ index }) => {
        setTimeout(() => {
          listRef.current?.scrollToOffset({ offset: webtoonLayout.offsets[index] ?? 0, animated: false })
        }, 100)
      }}
      renderItem={({ item, index }) => {
        const height = webtoonLayout.heights[index] ?? viewportW / DEFAULT_ASPECT
        return (
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => handleTap(e.nativeEvent.pageX, e.nativeEvent.pageY)}
            style={{ width: viewportW, height, alignItems: 'center', backgroundColor: '#000' }}>
            <Image
              source={isPageCached(server.id, book.id, item.number)
                ? { uri: pageLocalUri(server.id, book.id, item.number) }
                : { uri: komgaPageUrl(server, book.id, item.number), headers: komgaAuthHeader(server) }}
              style={{ width: viewportW, height }}
              resizeMode="contain"
            />
          </TouchableOpacity>
        )
      }}
      showsVerticalScrollIndicator={false}
      pagingEnabled={false}
      onScroll={(e) => {
        scrollOffsetRef.current = e.nativeEvent.contentOffset.y
      }}
      scrollEventThrottle={16}
      onMomentumScrollEnd={(e) => {
        const np = pageFromOffset(e.nativeEvent.contentOffset.y)
        if (np !== currentPage && np >= 1 && np <= pages.length) {
          setCurrentPage(np)
          if (np === pages.length) void komgaMarkRead(server, book.id).catch(() => {})
        }
      }}
      initialNumToRender={3}
      maxToRenderPerBatch={4}
      windowSize={5}
      extraData={book.id}
    />
  )

  const progress = pages.length > 0 ? currentPage / pages.length : 0

  // 翻页模式方向判断
  const isLtr = readingDirection === 'ltr'

  const goHome = () => goToPage(1)
  const goEnd = () => goToPage(pages.length)

  return (
    <View style={styles.root}>
      {loading || pages.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
          {pages.length > 0 && currentPage >= 1 && (
            <View style={styles.alwaysPageLabel} pointerEvents="none">
              <Text style={styles.alwaysPageLabelText}>
                第 {currentPage} / {pages.length} 页
              </Text>
            </View>
          )}
        </View>
      ) : (
        <>
          <View style={StyleSheet.absoluteFill}>
            {mode === 'paged' ? renderPaged() : renderWebtoon()}
          </View>

          {/* 永久显示的页码指示器（屏幕底部中央） */}
          <View style={[styles.alwaysPageLabelWrap, { bottom: insets.bottom + 12 }]} pointerEvents="none">
            <View style={styles.alwaysPageLabel}>
              <Text style={styles.alwaysPageLabelText}>
                第 {currentPage} / {pages.length} 页
              </Text>
            </View>
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
                <TouchableOpacity
                  activeOpacity={1}
                  style={styles.sliderTrack}
                  onLayout={(e) => { sliderWidthRef.current = e.nativeEvent.layout.width }}
                  onPress={(e) => {
                    const w = sliderWidthRef.current
                    if (w > 0) goToPage(pageFromSlider(e.nativeEvent.locationX, w))
                  }}
                  {...sliderResponder.panHandlers}>
                  <View style={[styles.sliderFill, { width: `${Math.max(0.5, progress * 100)}%`, backgroundColor: t.primary }]} />
                  <View style={[styles.sliderKnob, { backgroundColor: '#fff', left: `${progress * 100}%` }]} />
                </TouchableOpacity>
                <View style={styles.pageLabelRow}>
                  <Text style={styles.pageLabel}>
                    {mode === 'webtoon'
                      ? `第 ${currentPage} / ${pages.length} 页 · 上下滚动`
                      : `${currentPage} / ${pages.length}`}
                  </Text>
                </View>

                {/* 底部功能按钮 */}
                <View style={styles.bottomBtns}>
                  <TouchableOpacity onPress={goHome} style={styles.funcBtn}>
                    <Icon name="skipPrev" size={22} color="#fff" />
                    <Text style={styles.funcLabel}>首页</Text>
                  </TouchableOpacity>

                  {/* 上一页：条漫 ▲，左右模式 ◀（独立左箭头）
                      RTL 时「上一页」对应物理右移，故调 nextPage */}
                  <TouchableOpacity
                    onPress={() => {
                      if (mode === 'webtoon') {
                        prevPage()
                      } else if (isLtr) {
                        prevPage()
                      } else {
                        nextPage()
                      }
                    }}
                    style={styles.funcBtn}>
                    {mode === 'webtoon' ? (
                      <Icon name="chevronUp" size={22} color="#fff" />
                    ) : (
                      <Icon name="chevronLeft" size={22} color="#fff" />
                    )}
                    <Text style={styles.funcLabel}>上一页</Text>
                  </TouchableOpacity>

                  {/* 模式按钮：3 态循环 → 向左翻页 / 向右翻页 / 条漫模式（白色） */}
                  <TouchableOpacity onPress={cycleMode} style={styles.funcBtn}>
                    {mode === 'webtoon' ? (
                      <View style={{ flexDirection: 'column', alignItems: 'center' }}>
                        <Icon name="chevronUp" size={14} color="#fff" />
                        <Icon name="chevronDown" size={14} color="#fff" />
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Icon name="chevronLeft" size={18} color="#fff" />
                        <Icon name="chevronRight" size={18} color="#fff" />
                      </View>
                    )}
                    <Text style={styles.funcLabel}>
                      {mode === 'webtoon' ? '条漫模式' : (isLtr ? '向右翻页' : '向左翻页')}
                    </Text>
                  </TouchableOpacity>

                  {/* 下一页：条漫 ▼，左右模式 ▶（独立右箭头）
                      RTL 时「下一页」对应物理左移，故调 prevPage */}
                  <TouchableOpacity
                    onPress={() => {
                      if (mode === 'webtoon') {
                        nextPage()
                      } else if (isLtr) {
                        nextPage()
                      } else {
                        prevPage()
                      }
                    }}
                    style={styles.funcBtn}>
                    {mode === 'webtoon' ? (
                      <Icon name="chevronDown" size={22} color="#fff" />
                    ) : (
                      <Icon name="chevronRight" size={22} color="#fff" />
                    )}
                    <Text style={styles.funcLabel}>下一页</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={goEnd} style={styles.funcBtn}>
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
                          setCurrentPage(b.page)
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

          {/* 添加成功提示 Sheet */}
          <Modal
            visible={bookmarkAddedSheetVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setBookmarkAddedSheetVisible(false)}>
            <TouchableOpacity
              style={styles.sheetOverlay}
              activeOpacity={1}
              onPress={() => setBookmarkAddedSheetVisible(false)}>
              <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.toastBody, { backgroundColor: t.card }]}>
                <Icon name="check" size={28} color={t.primary} />
                <Text style={[styles.toastTitle, { color: t.text }]}>书签已添加</Text>
                <Text style={[styles.toastSub, { color: t.textMuted }]}>第 {currentPage} 页</Text>
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
  alwaysPageLabelWrap: { position: 'absolute', alignSelf: 'center', left: 0, right: 0, alignItems: 'center' },
  alwaysPageLabel: { backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 14 },
  alwaysPageLabelText: { color: '#fff', fontSize: 12, fontWeight: '600' },
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
    height: 32, justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, overflow: 'hidden', marginBottom: 8,
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
  toastBody: { borderRadius: 14, paddingHorizontal: 28, paddingVertical: 22, alignItems: 'center', gap: 6, marginHorizontal: 40 },
  toastTitle: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  toastSub: { fontSize: 13 },
})