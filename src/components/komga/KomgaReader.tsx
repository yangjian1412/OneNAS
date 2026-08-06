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

// 中间翻页带：x 中央 1/3
const SIDE_RATIO = 1 / 3
// 中央菜单矩形：y 上下各切掉 1/4
const CENTER_Y_TOP = SCREEN_H * 0.25
const CENTER_Y_BOTTOM = SCREEN_H * 0.75
// 预读后续页数
const PREFETCH_AHEAD = 5

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
  // 翻页按键反馈：'prev' | 'next' | null
  const [tappedDir, setTappedDir] = useState<'prev' | 'next' | null>(null)

  const listRef = useRef<FlatList<KomgaPage>>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sliderWidthRef = useRef(SCREEN_W)
  const tappedDirTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 条漫模式：按 page index 存真实测量高度（用于累计 offset 精准跳转）
  const webtoonHeightsRef = useRef<Map<number, number>>(new Map())
  // 条漫模式：累计偏移缓存（item index → 起始 offset），测量后实时更新
  const webtoonOffsetsRef = useRef<Map<number, number>>(new Map())
  // 当前 webtoon 总高度
  const webtoonContentHeightRef = useRef(0)

  // ── 加载页面列表 + 书信息 + 本地书签列表 ─────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setPages([])
    setCurrentPage(0)
    setShowControls(false)
    webtoonHeightsRef.current.clear()
    webtoonOffsetsRef.current.clear()
    webtoonContentHeightRef.current = 0
    Promise.all([
      komgaGetBookPages(server, book.id),
      komgaGetBook(server, book.id),
      getBookmarksForBook(server.id, book.id),
    ]).then(([pageList, fresh, bms]) => {
      if (cancelled) return
      setPages(pageList)
      setCurrentBook(fresh)
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

  // ── 计算条漫 item (pageNumber) 的累计偏移 ─────────────────────────
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

  // 初次挂载后跳到 currentPage（依赖 mode 变化时也保持当前页）
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
      // 条漫：滚到下一页的起始偏移
      const target = Math.min(webtoonContentHeightRef.current, (webtoonOffsetsRef.current.get(currentPage) ?? 0))
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
      // 条漫：滚到上一页的起始偏移
      const target = Math.max(0, (webtoonOffsetsRef.current.get(currentPage - 2) ?? 0))
      listRef.current?.scrollToOffset({ offset: target, animated: true })
    } else if (currentPage > 1) {
      goToPage(currentPage - 1)
    }
  }, [currentPage, goToPage, flashTapped, mode])

  // ── 反L形 9 区 tap 分区 ───────────────────────────────────────
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

  // ── 切换阅读模式：保持当前页 ───────────────────────────────
  const toggleMode = useCallback(() => {
    setMode((m) => {
      const next = m === 'paged' ? 'webtoon' : 'paged'
      // 切换后定位到当前页
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

  // ── 切换阅读方向：RTL 时 FlatList 用 inverted ─────────────────
  const toggleDirection = useCallback(() => {
    setReadingDirection((d) => {
      const next = d === 'ltr' ? 'rtl' : 'ltr'
      // 切换方向后保持当前页
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
  const imgForPage = (p: KomgaPage, pageW: number, pageH: number) => {
    const useLocal = isPageCached(server.id, book.id, p.number)
    const source = useLocal ? { uri: pageLocalUri(server.id, book.id, p.number) } : { uri: komgaPageUrl(server, book.id, p.number), headers: komgaAuthHeader(server) }
    return (
      <Image
        key={`${book.id}-${p.number}`}
        source={source}
        style={{ width: pageW, height: pageH }}
        resizeMode="contain"
      />
    )
  }

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
            {imgForPage(item, SCREEN_W, SCREEN_H)}
          </TouchableOpacity>
        )}
        horizontal
        inverted={isRtl}
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={Math.max(0, currentPage - 1)}
        getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
        onMomentumScrollEnd={(e) => {
          // inverted 模式下，offset 是从右往左计算的，所以 idx = (maxOffset - offset) / SCREEN_W
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

  const renderWebtoon = () => (
    <FlatList
      ref={listRef}
      data={pages}
      keyExtractor={(p) => String(p.number)}
      renderItem={({ item, index }) => (
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => handleTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height
            if (h > 0) {
              const prev = webtoonHeightsRef.current.get(index)
              if (prev !== h) {
                webtoonHeightsRef.current.set(index, h)
                // 增量更新后续 item 的偏移
                recomputeWebtoonOffsets()
              }
            }
          }}
          style={{ width: SCREEN_W, alignItems: 'center', justifyContent: 'flex-start', backgroundColor: '#000' }}>
          <Image
            source={isPageCached(server.id, book.id, item.number)
              ? { uri: pageLocalUri(server.id, book.id, item.number) }
              : { uri: komgaPageUrl(server, book.id, item.number), headers: komgaAuthHeader(server) }}
            style={{ width: SCREEN_W, height: undefined, aspectRatio: 1 }}
            resizeMode="contain"
          />
        </TouchableOpacity>
      )}
      showsVerticalScrollIndicator={false}
      pagingEnabled={false}
      onContentSizeChange={() => {
        recomputeWebtoonOffsets()
      }}
      onMomentumScrollEnd={(e) => {
        const offsetY = e.nativeEvent.contentOffset.y
        // 找到 offsetY 落入的 item 范围
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

  // 条漫模式下：被点中的方向闪主题色
  const prevColor = (mode === 'webtoon' && tappedDir === 'prev') ? t.primary : '#fff'
  const nextColor = (mode === 'webtoon' && tappedDir === 'next') ? t.primary : '#fff'
  // 翻页模式下：根据方向决定哪个箭头是主题色（前进方向 = 主题色）
  const pagedPrevColor = mode === 'paged' ? (readingDirection === 'rtl' ? t.primary : '#fff') : prevColor
  const pagedNextColor = mode === 'paged' ? (readingDirection === 'ltr' ? t.primary : '#fff') : nextColor
  // 模式图标颜色：条漫主题色 / 翻页白色
  const modeColor = mode === 'webtoon' ? t.primary : '#fff'

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
                    <Icon name="chevronLeft" size={22} color={pagedPrevColor} />
                    <Text style={styles.funcLabel}>{mode === 'webtoon' ? '上滚' : '上一页'}</Text>
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
                    <View style={{ flexDirection: 'row', gap: 0 }}>
                      <Icon name="chevronLeft" size={16} color={mode === 'paged' ? t.primary : '#fff'} />
                      <Icon name="chevronRight" size={16} color={mode === 'paged' ? t.primary : '#fff'} />
                    </View>
                    <Text style={styles.funcLabel}>{mode === 'paged' ? (readingDirection === 'ltr' ? '右→左' : '左→右') : '方向'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={nextPage} style={styles.funcBtn}>
                    <Icon name="chevronRight" size={22} color={pagedNextColor} />
                    <Text style={styles.funcLabel}>{mode === 'webtoon' ? '下滚' : '下一页'}</Text>
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