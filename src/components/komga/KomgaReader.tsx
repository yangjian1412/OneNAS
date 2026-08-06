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

// 条漫 item 高度：一屏，避免变高 item 累计偏移计算错误导致 red screen
const WEBTOON_ITEM_HEIGHT = SCREEN_H
// 中间翻页带：x 中央 1/3
const SIDE_RATIO = 1 / 3
// 中央菜单矩形：y 上下各切掉 1/4
const CENTER_Y_TOP = SCREEN_H * 0.25
const CENTER_Y_BOTTOM = SCREEN_H * 0.75

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
  // 翻页按键反馈：'prev' | 'next' | null（条漫模式）
  const [tappedDir, setTappedDir] = useState<'prev' | 'next' | null>(null)

  const listRef = useRef<FlatList<KomgaPage>>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sliderWidthRef = useRef(SCREEN_W)
  const tappedDirTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 条漫模式：当前 scroll offset + max offset，用于 scrollUp/scrollDown
  const scrollOffsetRef = useRef(0)
  const maxOffsetRef = useRef(0)

  // ── 加载页面列表 + 书信息 + 本地书签列表 ─────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setPages([])
    setCurrentPage(0)
    setShowControls(false)
    scrollOffsetRef.current = 0
    maxOffsetRef.current = 0
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

  // ── paged 模式跳页（webtoon 模式用 scrollUp/scrollDown）──
  const goToPage = useCallback((p: number) => {
    if (mode === 'webtoon') return // webtoon 用 scrollOffset
    const target = Math.max(1, Math.min(p, pages.length))
    listRef.current?.scrollToIndex({ index: target - 1, animated: true })
  }, [pages.length, mode])

  // ── webtoon 模式：滚动一屏 ────────────────────────────────
  const scrollUp = useCallback(() => {
    if (mode !== 'webtoon') return
    const target = Math.max(0, scrollOffsetRef.current - SCREEN_H)
    listRef.current?.scrollToOffset({ offset: target, animated: true })
  }, [mode])

  const scrollDown = useCallback(() => {
    if (mode !== 'webtoon') return
    const target = Math.min(maxOffsetRef.current, scrollOffsetRef.current + SCREEN_H)
    listRef.current?.scrollToOffset({ offset: target, animated: true })
  }, [mode])

  // 初次挂载后跳到 currentPage
  useEffect(() => {
    if (!loading && pages.length > 0 && currentPage >= 1) {
      const timer = setTimeout(() => {
        if (mode === 'webtoon') {
          const target = WEBTOON_ITEM_HEIGHT * (currentPage - 1)
          listRef.current?.scrollToOffset({ offset: target, animated: false })
        } else {
          listRef.current?.scrollToIndex({ index: currentPage - 1, animated: false })
        }
      }, 80)
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
    if (mode === 'webtoon') {
      scrollDown()
    } else if (currentPage < pages.length) {
      goToPage(currentPage + 1)
    } else {
      onClose()
    }
  }, [currentPage, pages.length, goToPage, onClose, flashTapped, mode, scrollDown])

  const prevPage = useCallback(() => {
    flashTapped('prev')
    if (mode === 'webtoon') {
      scrollUp()
    } else if (currentPage > 1) {
      goToPage(currentPage - 1)
    }
  }, [currentPage, goToPage, flashTapped, mode, scrollUp])

  // ── 反L形 9 区 tap 分区 ───────────────────────────────────────
  // 左右各 1/3：翻页/滚动；中间 1/3 x，上下 1/4 y：翻页；中央矩形：菜单
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

    // 翻页/滚动语义
    let goPrev = false
    if (mode === 'webtoon') {
      // 条漫：左/上 → 上滚一屏，右/下 → 下滚一屏
      const goUp = inLeftSide || (inCenterX && y < CENTER_Y_TOP)
      goPrev = goUp
    } else {
      // paged：根据 readingDirection
      // ltr: 左/上 → 上一页，右/下 → 下一页
      // rtl: 左/上 → 下一页，右/下 → 上一页
      const goLeft = inLeftSide || (inCenterX && y < CENTER_Y_TOP)
      goPrev = readingDirection === 'ltr' ? goLeft : !goLeft
    }

    if (goPrev) prevPage()
    else nextPage()
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

  const renderPaged = () => (
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
      renderItem={({ item }) => (
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => handleTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
          style={{ width: SCREEN_W, height: WEBTOON_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
          {imgForPage(item, SCREEN_W, WEBTOON_ITEM_HEIGHT)}
        </TouchableOpacity>
      )}
      showsVerticalScrollIndicator={false}
      pagingEnabled={false}
      getItemLayout={(_, index) => ({ length: WEBTOON_ITEM_HEIGHT, offset: WEBTOON_ITEM_HEIGHT * index, index })}
      onScroll={(e) => {
        scrollOffsetRef.current = e.nativeEvent.contentOffset.y
        maxOffsetRef.current = Math.max(0, e.nativeEvent.contentSize.height - e.nativeEvent.layoutMeasurement.height)
      }}
      scrollEventThrottle={16}
      onMomentumScrollEnd={(e) => {
        const offsetY = e.nativeEvent.contentOffset.y
        const idx = Math.round(offsetY / WEBTOON_ITEM_HEIGHT)
        const np = idx + 1
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

  // 当前模式下前/后翻页箭头的颜色：条漫模式下被点击的那个闪主题色
  const prevColor = (mode === 'webtoon' && tappedDir === 'prev') ? t.primary : '#fff'
  const nextColor = (mode === 'webtoon' && tappedDir === 'next') ? t.primary : '#fff'
  // 模式图标颜色：条漫模式下显示主题色，翻页模式显示白色
  const modeColor = mode === 'webtoon' ? t.primary : '#fff'

  // 底栏按钮：webtoon 模式下首页/末页=滚顶/滚底；paged 模式=跳页
  const goHome = () => {
      if (mode === 'webtoon') {
        listRef.current?.scrollToOffset({ offset: 0, animated: true })
      } else {
        goToPage(1)
      }
    }
  const goEnd = () => {
    if (mode === 'webtoon') {
      const target = Math.max(0, maxOffsetRef.current)
      listRef.current?.scrollToOffset({ offset: target, animated: true })
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
                    <Icon name="chevronLeft" size={22} color={prevColor} />
                    <Text style={styles.funcLabel}>{mode === 'webtoon' ? '上滚' : '上一页'}</Text>
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
                  {mode === 'paged' && (
                    <TouchableOpacity
                      onPress={() => setReadingDirection((d) => (d === 'ltr' ? 'rtl' : 'ltr'))}
                      style={styles.funcBtn}>
                      <View style={{ flexDirection: 'row', gap: 0 }}>
                        <Icon name="chevronLeft" size={16} color="#fff" />
                        <Icon name="chevronRight" size={16} color="#fff" />
                      </View>
                      <Text style={styles.funcLabel}>{readingDirection === 'ltr' ? '右→左' : '左→右'}</Text>
                    </TouchableOpacity>
                  )}
                  {mode === 'webtoon' && (
                    <View style={styles.funcBtn}>
                      <View style={{ flexDirection: 'row', gap: 0 }}>
                        <Icon name="chevronLeft" size={16} color="#fff" />
                        <Icon name="chevronRight" size={16} color="#fff" />
                      </View>
                      <Text style={styles.funcLabel}>方向</Text>
                    </View>
                  )}
                  <TouchableOpacity onPress={nextPage} style={styles.funcBtn}>
                    <Icon name="chevronRight" size={22} color={nextColor} />
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
                            const target = WEBTOON_ITEM_HEIGHT * (b.page - 1)
                            listRef.current?.scrollToOffset({ offset: target, animated: true })
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