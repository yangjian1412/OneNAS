import { useState, useEffect, useRef, useCallback } from 'react'
import { View, Text, Image, TouchableOpacity, Dimensions, ActivityIndicator, StyleSheet, Alert, FlatList, PanResponder, Modal, ScrollView } from 'react-native'
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

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

// 中间翻页带：x 中央 1/3
const SIDE_RATIO = 1 / 3
// 中央菜单矩形：y 上下各切掉 1/4
const CENTER_Y_TOP = SCREEN_H * 0.25
const CENTER_Y_BOTTOM = SCREEN_H * 0.75
// 预读后续页数
const PREFETCH_AHEAD = 5
// 条漫默认 aspect（在拿到真实尺寸前用）
const DEFAULT_ASPECT = 0.65

type ReaderMode = 'paged' | 'webtoon'

export default function KomgaReader({ server, book, onClose }: Props) {
  const t = useTheme()
  useImmersive(true)
  const insets = useSafeAreaInsets()

  const [pages, setPages] = useState<KomgaPage[]>([])
  const [currentPage, setCurrentPage] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [showControls, setShowControls] = useState(false)
  const [currentBook, setCurrentBook] = useState<KomgaBook>(book)
  const [mode, setMode] = useState<ReaderMode>('paged')
  const [readingDirection, setReadingDirection] = useState<'ltr' | 'rtl'>('ltr')
  const [bookmarkList, setBookmarkList] = useState<KomgaLocalBookmark[]>([])
  const [bookmarkSheetVisible, setBookmarkSheetVisible] = useState(false)
  const [bookmarkAddedSheetVisible, setBookmarkAddedSheetVisible] = useState(false)
  // 条漫模式：image aspect (width/height) 缓存
  const [webtoonAspects, setWebtoonAspects] = useState<Record<number, number>>({})
  // 翻页按键反馈
  const [tappedDir, setTappedDir] = useState<'prev' | 'next' | null>(null)

  const listRef = useRef<FlatList<KomgaPage>>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sliderWidthRef = useRef(SCREEN_W)
  const tappedDirTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 条漫 item 真实测量高度
  const webtoonHeightsRef = useRef<Map<number, number>>(new Map())
  // 条漫累计偏移缓存
  const webtoonOffsetsRef = useRef<Map<number, number>>(new Map())
  const webtoonContentHeightRef = useRef(0)

  // ── 加载页面列表 + 书信息 + 本地书签 + 阅读偏好 ─────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setPages([])
    setCurrentPage(0)
    setShowControls(false)
    webtoonHeightsRef.current.clear()
    webtoonOffsetsRef.current.clear()
    webtoonContentHeightRef.current = 0
    setWebtoonAspects({})
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

  // ── 累计偏移缓存重算 ────────────────────────────────
  const recomputeWebtoonOffsets = useCallback(() => {
    const offsets = new Map<number, number>()
    let sum = 0
    const total = pages.length
    for (let i = 0; i < total; i++) {
      offsets.set(i, sum)
      sum += webtoonHeightsRef.current.get(i) ?? 0
    }
    webtoonOffsetsRef.current = offsets
    webtoonContentHeightRef.current = sum
  }, [pages.length])

  // ── 跳页 ────────────────────────────────────────────────────────
  const goToPage = useCallback((p: number) => {
    const target = Math.max(1, Math.min(p, pages.length))
    if (mode === 'webtoon') {
      const offset = webtoonOffsetsRef.current.get(target - 1) ?? 0
      listRef.current?.scrollToOffset({ offset, animated: true })
    } else {
      listRef.current?.scrollToIndex({ index: target - 1, animated: true })
    }
  }, [pages.length, mode])

  useEffect(() => {
    if (!loading && pages.length > 0 && currentPage >= 1) {
      const timer = setTimeout(() => {
        if (mode === 'webtoon') {
          const offset = webtoonOffsetsRef.current.get(currentPage - 1) ?? 0
          listRef.current?.scrollToOffset({ offset, animated: false })
        } else {
          listRef.current?.scrollToIndex({ index: currentPage - 1, animated: false })
        }
      }, 80)
      return () => clearTimeout(timer)
    }
  }, [loading, mode, currentPage]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 翻页 + 按键反馈 ───────────────────────────────────────────────
  const flashTapped = useCallback((dir: 'prev' | 'next') => {
    setTappedDir(dir)
    if (tappedDirTimerRef.current) clearTimeout(tappedDirTimerRef.current)
    tappedDirTimerRef.current = setTimeout(() => setTappedDir(null), 180)
  }, [])

  const nextPage = useCallback(() => {
    flashTapped('next')
    if (mode === 'webtoon') {
      const target = webtoonOffsetsRef.current.get(currentPage) ?? 0
      listRef.current?.scrollToOffset({ offset: target, animated: true })
    } else if (currentPage < pages.length) {
      goToPage(currentPage + 1)
    } else {
      onClose()
    }
  }, [currentPage, pages.length, goToPage, onClose, flashTapped, mode])

  const prevPage = useCallback(() => {
    flashTapped('prev')
    if (mode === 'webtoon') {
      const target = webtoonOffsetsRef.current.get(currentPage - 2) ?? 0
      listRef.current?.scrollToOffset({ offset: Math.max(0, target), animated: true })
    } else if (currentPage > 1) {
      goToPage(currentPage - 1)
    }
  }, [currentPage, goToPage, flashTapped, mode])

  // ── 反L 9 区 tap ────────────────────────────────────────────────
  const handleTap = (x: number, y: number) => {
    if (showControls) { setShowControls(false); return }
    const inLeftSide = x < SCREEN_W * SIDE_RATIO
    const inRightSide = x > SCREEN_W * (1 - SIDE_RATIO)
    const inCenterX = !inLeftSide && !inRightSide
    const isCenterMenu = inCenterX && y >= CENTER_Y_TOP && y <= CENTER_Y_BOTTOM

    if (isCenterMenu) {
      setShowControls(true)
      return
    }

    let goPrev = false
    if (mode === 'webtoon') {
      const goUp = inLeftSide || (inCenterX && y < CENTER_Y_TOP)
      goPrev = goUp
    } else {
      const goLeft = inLeftSide || (inCenterX && y < CENTER_Y_TOP)
      goPrev = readingDirection === 'ltr' ? goLeft : !goLeft
    }

    if (goPrev) prevPage()
    else nextPage()
  }

  // ── 切换阅读模式（保持当前页）────────────────────────────────
  const toggleMode = useCallback(() => {
    setMode((m) => {
      const next = m === 'paged' ? 'webtoon' : 'paged'
      setTimeout(() => {
        if (next === 'webtoon') {
          const offset = webtoonOffsetsRef.current.get(currentPage - 1) ?? 0
          listRef.current?.scrollToOffset({ offset, animated: false })
        } else {
          listRef.current?.scrollToIndex({ index: currentPage - 1, animated: false })
        }
      }, 60)
      return next
    })
  }, [currentPage])

  // ── 切换阅读方向（保持当前页）────────────────────────────────
  const toggleDirection = useCallback(() => {
    setReadingDirection((d) => {
      const next = d === 'ltr' ? 'rtl' : 'ltr'
      setTimeout(() => {
        if (mode === 'paged') {
          listRef.current?.scrollToIndex({ index: currentPage - 1, animated: false })
        }
      }, 60)
      return next
    })
  }, [currentPage, mode])

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

  // ── paged FlatList ───────────────────────────────────────────────
  const renderPaged = () => {
    const isRtl = readingDirection === 'rtl'
    return (
      <FlatList
        ref={listRef}
        data={pages}
        keyExtractor={(p) => String(p.number)}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => handleTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
            style={{ width: SCREEN_W, height: SCREEN_H, alignItems: 'center', justifyContent: 'center' }}>
            <Image
              source={isPageCached(server.id, book.id, item.number)
                ? { uri: pageLocalUri(server.id, book.id, item.number) }
                : { uri: komgaPageUrl(server, book.id, item.number), headers: komgaAuthHeader(server) }}
              style={{ width: SCREEN_W, height: SCREEN_H }}
              resizeMode="contain"
            />
          </TouchableOpacity>
        )}
        horizontal
        inverted={isRtl}
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={Math.max(0, currentPage - 1)}
        getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
        onMomentumScrollEnd={(e) => {
          const offsetX = e.nativeEvent.contentOffset.x
          const idx = Math.round(offsetX / SCREEN_W)
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
  }

  // ── webtoon FlatList：item 紧贴、image 填宽，按真实 aspect 自适应高 ──
  const renderWebtoon = () => (
    <FlatList
      ref={listRef}
      data={pages}
      keyExtractor={(p) => String(p.number)}
      renderItem={({ item, index }) => {
        const aspect = webtoonAspects[item.number] ?? DEFAULT_ASPECT
        return (
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => handleTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height
              if (h > 0) {
                const prev = webtoonHeightsRef.current.get(index)
                if (prev !== h) {
                  webtoonHeightsRef.current.set(index, h)
                  recomputeWebtoonOffsets()
                }
              }
            }}
            style={{ width: SCREEN_W, alignItems: 'center', backgroundColor: '#000' }}>
            <Image
              source={isPageCached(server.id, book.id, item.number)
                ? { uri: pageLocalUri(server.id, book.id, item.number) }
                : { uri: komgaPageUrl(server, book.id, item.number), headers: komgaAuthHeader(server) }}
              style={{ width: SCREEN_W, height: undefined, aspectRatio: aspect }}
              resizeMode="contain"
              onLoad={(e) => {
                const { width, height } = e.nativeEvent.source
                if (width && height) {
                  const realAspect = width / height
                  setWebtoonAspects((prev) => {
                    if (prev[item.number] === realAspect) return prev
                    return { ...prev, [item.number]: realAspect }
                  })
                }
              }}
            />
          </TouchableOpacity>
        )
      }}
      showsVerticalScrollIndicator={false}
      pagingEnabled={false}
      onContentSizeChange={() => {
        recomputeWebtoonOffsets()
      }}
      onMomentumScrollEnd={(e) => {
        const offsetY = e.nativeEvent.contentOffset.y
        let np = currentPage
        const offsets = webtoonOffsetsRef.current
        for (const [idx, off] of offsets) {
          const next = offsets.get(idx + 1)
          if (next === undefined) {
            if (offsetY >= off) np = idx + 1
          } else if (offsetY >= off && offsetY < next) {
            np = idx + 1
            break
          }
        }
        if (np !== currentPage && np >= 1 && np <= pages.length) {
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

  const progress = pages.length > 0 ? currentPage / pages.length : 0

  // 条漫：被点击方向闪主题色（短暂）
  const webPrevColor = (mode === 'webtoon' && tappedDir === 'prev') ? t.primary : '#fff'
  const webNextColor = (mode === 'webtoon' && tappedDir === 'next') ? t.primary : '#fff'
  // 模式图标颜色
  const modeColor = mode === 'webtoon' ? t.primary : '#fff'
  // 翻页模式方向图标半色：左半 / 右半各取一个颜色
  const isLtr = readingDirection === 'ltr'
  const leftArrowColor = mode === 'paged' ? (isLtr ? '#fff' : t.primary) : webPrevColor
  const rightArrowColor = mode === 'paged' ? (isLtr ? t.primary : '#fff') : webNextColor

  const goHome = () => {
    if (mode === 'webtoon') {
      listRef.current?.scrollToOffset({ offset: 0, animated: true })
    } else {
      goToPage(1)
    }
  }
  const goEnd = () => {
    if (mode === 'webtoon') {
      const lastIdx = pages.length - 1
      const offset = webtoonOffsetsRef.current.get(lastIdx) ?? 0
      listRef.current?.scrollToOffset({ offset, animated: true })
    } else {
      goToPage(pages.length)
    }
  }

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
                  <TouchableOpacity onPress={prevPage} style={styles.funcBtn}>
                    <Icon name="chevronLeft" size={22} color={mode === 'webtoon' ? webPrevColor : leftArrowColor} />
                    <Text style={styles.funcLabel}>
                      {mode === 'webtoon' ? '上滚' : (isLtr ? '向左翻页' : '上一页')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={toggleMode}
                    style={styles.funcBtn}>
                    <View style={{ flexDirection: 'column', alignItems: 'center' }}>
                      <Icon name="chevronUp" size={14} color={modeColor} />
                      <Icon name="chevronDown" size={14} color={modeColor} />
                    </View>
                    <Text style={[styles.funcLabel, { color: modeColor }]}>{mode === 'paged' ? '条漫' : '翻页'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={toggleDirection}
                    style={styles.funcBtn}>
                    {mode === 'webtoon' ? (
                      // 条漫：方向无意义，左右双白
                      <View style={{ flexDirection: 'row', gap: 0 }}>
                        <Icon name="chevronLeft" size={16} color="#fff" />
                        <Icon name="chevronRight" size={16} color="#fff" />
                      </View>
                    ) : (
                      // 翻页：左半色 + 右半色
                      <View style={{ flexDirection: 'row', gap: 0 }}>
                        <Icon name="chevronLeft" size={16} color={leftArrowColor} />
                        <Icon name="chevronRight" size={16} color={rightArrowColor} />
                      </View>
                    )}
                    <Text style={styles.funcLabel}>
                      {mode === 'webtoon' ? '方向' : (isLtr ? '向右翻页' : '左→右')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={nextPage} style={styles.funcBtn}>
                    <Icon name="chevronRight" size={22} color={mode === 'webtoon' ? webNextColor : rightArrowColor} />
                    <Text style={styles.funcLabel}>
                      {mode === 'webtoon' ? '下滚' : (isLtr ? '下一页' : '向右翻页')}
                    </Text>
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
                          if (mode === 'webtoon') {
                            const offset = webtoonOffsetsRef.current.get(b.page - 1) ?? 0
                            listRef.current?.scrollToOffset({ offset, animated: true })
                          } else {
                            goToPage(b.page)
                          }
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
  toastBody: { borderRadius: 14, paddingHorizontal: 28, paddingVertical: 22, alignItems: 'center', gap: 6, marginHorizontal: 40 },
  toastTitle: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  toastSub: { fontSize: 13 },
})