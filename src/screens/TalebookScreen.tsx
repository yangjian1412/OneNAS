import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, BackHandler, Modal, StyleSheet, Alert, Linking, Image } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useAppStore } from '@/stores/appStore'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import { useTalebookStore } from '@/stores/talebookStore'
import { talebookGetBookDetail, talebookGetCoverUrl, talebookSearch, talebookGetReadUrl, talebookGetDownloadUrl, talebookToggleShelf } from '@/lib/api/talebook'
import { talebookGetShelf } from '@/lib/api/talebook'
import type { ServiceConfig, TalebookBook, TalebookBookDetail, TalebookServerConfig } from '@/types'
import TalebookHeader from '@/components/talebook/TalebookHeader'
import TalebookBookRow from '@/components/talebook/TalebookBookRow'
import TalebookDrawer from '@/components/talebook/TalebookDrawer'
import TalebookReaderModal from '@/components/talebook/TalebookReaderModal'
import { enqueueDownloadWithHeader } from '@/lib/downloadManager'
import { checkStoragePermission, openAllFilesSettings } from '@/lib/downloadManager'

type ViewType = 'home' | 'search' | 'detail'

interface Props {
  service: ServiceConfig
  onRequestClose?: () => void
}

export default function TalebookScreen({ service, onRequestClose }: Props) {
  const t = useTheme()
  const isFocused = useIsFocused()
  const initWithService = useTalebookStore((s) => s.initWithService)
  const loadHome = useTalebookStore((s) => s.loadHome)
  const server = useTalebookStore((s) => s.server)
  const userInfo = useTalebookStore((s) => s.userInfo)
  const shelfBooks = useTalebookStore((s) => s.shelfBooks)
  const randomBooks = useTalebookStore((s) => s.randomBooks)
  const newBooks = useTalebookStore((s) => s.newBooks)
  const recentBooks = useTalebookStore((s) => s.recentBooks)
  const isLoading = useTalebookStore((s) => s.isLoading)
  const error = useTalebookStore((s) => s.error)
  const setError = useTalebookStore((s) => s.setError)

  const [view, setView] = useState<ViewType>('home')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<TalebookBook[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detail, setDetail] = useState<TalebookBookDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [readerOpen, setReaderOpen] = useState(false)
  const [readerUrl, setReaderUrl] = useState('')
  const [readerCookie, setReaderCookie] = useState('')
  const [readerTitle, setReaderTitle] = useState('')
  const [shelfState, setShelfState] = useState<'idle' | 'adding' | 'removing'>('idle')
  const [shelfHint, setShelfHint] = useState<string | null>(null)
  const [inShelf, setInShelf] = useState(false)
  const addDownload = useAppStore((s) => s.addDownload)

  const viewStackRef = useRef<ViewType[]>([])

  useEffect(() => {
    if (isFocused) void initWithService(service)
  }, [isFocused, initWithService, service])

  useEffect(() => {
    if (isFocused && server && view === 'home') void loadHome(false)
  }, [isFocused, server, view, loadHome])

  const isLoggedIn = !!server?.cookie && !!userInfo?.isLogin

  const handleBack = useCallback((): boolean => {
    if (drawerOpen) { setDrawerOpen(false); return true }
    if (readerOpen) { setReaderOpen(false); return true }
    if (viewStackRef.current.length > 0) {
      const prev = viewStackRef.current.pop()!
      setView(prev)
      return true
    }
    if (view !== 'home') { setView('home'); return true }
    if (onRequestClose) { onRequestClose(); return true }
    return false
  }, [drawerOpen, readerOpen, view, onRequestClose])

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', handleBack)
    return () => handler.remove()
  }, [handleBack])

  const doSearch = useCallback(async () => {
    if (!server || !searchQuery.trim()) return
    const result = await talebookSearch(server, searchQuery.trim())
    if (result.ok) {
      setSearchResults(result.books ?? [])
      viewStackRef.current.push(view)
      setView('search')
    } else {
      setError(result.error ?? '搜索失败')
    }
  }, [server, searchQuery, view, setError])

  const handleBookPress = useCallback(async (book: TalebookBook) => {
    if (!server) return
    viewStackRef.current.push(view)
    setDetail(null)
    setDetailLoading(true)
    setView('detail')
    const result = await talebookGetBookDetail(server, book.id)
    setDetailLoading(false)
    if (!result.ok || !result.book) {
      setError(result.error ?? '加载图书详情失败')
      viewStackRef.current.pop()
      setView(view)
    } else {
      setDetail(result.book)
      // 探测当前是否已在书架
      const shelfRes = await talebookGetShelf(server)
      setInShelf((shelfRes.ok && (shelfRes.books ?? []).some((b) => b.id === result.book!.id)) || false)
    }
  }, [server, view, setError])

  const handleToggleShelf = useCallback(async () => {
    if (!detail || !server) return
    setShelfHint(null)
    setShelfState(inShelf ? 'removing' : 'adding')
    try {
      const next = !inShelf
      const ok = await talebookToggleShelf(server, detail.id, next)
      if (ok) {
        setInShelf(next)
        setShelfHint(next ? '已加入书架' : '已移出书架')
        void loadHome(true)
      } else {
        setShelfHint('操作失败，请先登录')
      }
    } catch {
      setShelfHint('操作失败')
    } finally {
      setShelfState('idle')
    }
  }, [detail, server, inShelf, loadHome])

  const handleDownload = useCallback(async () => {
    if (!detail || !server) return
    const file = detail.files?.[0]
    if (!file) {
      Alert.alert('该书无可下载格式')
      return
    }
    if (!(await checkStoragePermission())) {
      Alert.alert('需要文件访问权限', '下载文件需要「所有文件访问权限」。请在系统设置中开启。', [
        { text: '取消', style: 'cancel' },
        { text: '去设置', onPress: () => openAllFilesSettings() },
      ])
      return
    }
    const ext = (file.format || 'bin').toLowerCase()
    const safeTitle = (detail.title || `book-${detail.id}`).replace(/[\\/:*?"<>|]/g, '_')
    const fileName = `${safeTitle}.${ext}`
    try {
      const task = await enqueueDownloadWithHeader(
        talebookGetDownloadUrl(server, file.href),
        fileName,
        'Cookie',
        server.cookie ?? '',
      )
      addDownload(task)
      Alert.alert('已加入下载队列', fileName)
    } catch (e: any) {
      Alert.alert('下载失败', e?.message ?? '未知错误')
    }
  }, [detail, server, addDownload])

  const handleRead = useCallback(() => {
    if (!detail || !server) return
    setReaderUrl(talebookGetReadUrl(server, detail.id))
    setReaderCookie(server.cookie ?? '')
    setReaderTitle(detail.title || '阅读')
    setReaderOpen(true)
  }, [detail, server])

  const showBack = view !== 'home'

  if (!server) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator size="large" color={t.primary} />
        <Text style={[styles.loadingText, { color: t.textMuted }]}>正在连接 Talebook...</Text>
      </View>
    )
  }

  return (
    <View style={[styles.screen, { backgroundColor: t.bg }]}>
      <TalebookHeader
        isHome={!showBack}
        searchQuery={searchQuery}
        onChangeSearch={setSearchQuery}
        onSubmitSearch={doSearch}
        onClearSearch={() => {
          setSearchQuery('')
          if (view === 'search') {
            viewStackRef.current.pop()
            setView('home')
          }
        }}
        onMenu={() => setDrawerOpen(true)}
        onBack={handleBack}
      />

      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: (t.warning || '#f0a020') + '22' }]}>
          <Text style={[styles.errorBannerText, { color: t.warning || '#a06000' }]}>{error}</Text>
        </View>
      ) : null}

      {view === 'home' && (
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 32 }]}>
          <HomeSection title="最近浏览" icon="schedule">
            <TalebookBookRow server={server} books={recentBooks} onPress={handleBookPress} emptyText="暂无最近浏览" />
          </HomeSection>
          <HomeSection title="我的书架" icon="bookmark">
            <TalebookBookRow server={server} books={shelfBooks} onPress={handleBookPress} emptyText="书架为空，去添加喜欢的书吧" />
          </HomeSection>
          <HomeSection title="随机推荐" icon="trendingUp">
            <TalebookBookRow server={server} books={randomBooks} onPress={handleBookPress} emptyText="暂无推荐" />
          </HomeSection>
          <HomeSection title="最新上架" icon="plus">
            <TalebookBookRow server={server} books={newBooks} onPress={handleBookPress} emptyText="暂无新书" />
          </HomeSection>
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {view === 'home' && isLoading && (
        <View style={styles.center}><ActivityIndicator size="large" color={t.primary} /></View>
      )}

      {view === 'search' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.sectionTitle, { color: t.text, paddingHorizontal: 16 }]}>
            搜索 "{searchQuery}" · {searchResults.length} 条
          </Text>
          {searchResults.length === 0 ? (
            <Text style={[styles.emptyHint, { color: t.textMuted }]}>无结果</Text>
          ) : (
            searchResults.map((b) => (
              <SearchResultRow key={b.id} server={server} book={b} onPress={() => handleBookPress(b)} />
            ))
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {view === 'detail' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {detailLoading || !detail ? (
            <View style={styles.center}><ActivityIndicator size="large" color={t.primary} /></View>
          ) : (
            <DetailContent
              server={server}
              detail={detail}
              isLoggedIn={isLoggedIn}
              inShelf={inShelf}
              shelfHint={shelfHint}
              shelfState={shelfState}
              onRead={handleRead}
              onToggleShelf={handleToggleShelf}
              onDownload={handleDownload}
              theme={t}
            />
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      <TalebookDrawer
        visible={drawerOpen}
        server={server}
        serverVersion={server.serverVersion || userInfo?.serverVersion}
        isLoggedIn={isLoggedIn}
        nickname={userInfo?.nickname || server.nickname}
        onClose={() => setDrawerOpen(false)}
      />

      <TalebookReaderModal
        visible={readerOpen}
        url={readerUrl}
        cookie={readerCookie}
        title={readerTitle}
        onClose={() => setReaderOpen(false)}
      />
    </View>
  )
}

function HomeSection({ title, icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  const t = useTheme()
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          <Icon name={icon} size={18} color={t.primary} />
          <Text style={[styles.sectionTitle, { color: t.text }]}>{title}</Text>
        </View>
      </View>
      {children}
    </View>
  )
}

function SearchResultRow({ server, book, onPress }: { server: TalebookServerConfig; book: TalebookBook; onPress: () => void }) {
  const t = useTheme()
  const cover = talebookGetCoverUrl(server, book.cover || book.img || book.thumb, 120)
  const authors = (book.authors || []).join(' / ')
  const intro = book.comments || ''
  return (
    <TouchableOpacity style={[styles.searchRow, { backgroundColor: t.card, borderColor: t.border }]} activeOpacity={0.7} onPress={onPress}>
      <View style={[styles.searchCover, { backgroundColor: t.border }]}>
        {cover ? <Image source={{ uri: cover }} style={styles.searchCoverImg} resizeMode="cover" /> : <Icon name="bookmark" size={26} color={t.textMuted} />}
      </View>
      <View style={styles.searchInfo}>
        <Text style={[styles.searchTitle, { color: t.text }]} numberOfLines={2}>{book.title || '无题'}</Text>
        {!!authors && <Text style={[styles.searchAuthor, { color: t.textMuted }]} numberOfLines={1}>{authors}</Text>}
        {!!intro && <Text style={[styles.searchIntro, { color: t.textMuted }]} numberOfLines={3}>{intro}</Text>}
      </View>
      <Icon name="chevronRight" size={18} color={t.textMuted} />
    </TouchableOpacity>
  )
}

function DetailContent({ server, detail, isLoggedIn, inShelf, shelfHint, shelfState, onRead, onToggleShelf, onDownload, theme }: {
  server: TalebookServerConfig
  detail: TalebookBookDetail
  isLoggedIn: boolean
  inShelf: boolean
  shelfHint: string | null
  shelfState: 'idle' | 'adding' | 'removing'
  onRead: () => void
  onToggleShelf: () => void
  onDownload: () => void
  theme: ReturnType<typeof useTheme>
}) {
  const t = theme
  const cover = talebookGetCoverUrl(server, detail.cover || detail.img || detail.thumb, 400)
  const authors = (detail.authors || []).join(' / ')
  const hasFile = (detail.files?.length ?? 0) > 0
  return (
    <View>
      <View style={[styles.detailHeader, { backgroundColor: t.card }]}>
        <View style={styles.detailCoverWrap}>
          <View style={[styles.detailCover, { backgroundColor: t.border }]}>
            {cover ? (
              <View style={styles.detailCoverImg}>
                {(() => {
                  const { Image } = require('react-native') as typeof import('react-native')
                  return <Image source={{ uri: cover }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                })()}
              </View>
            ) : (
              <Icon name="bookmark" size={40} color={t.textMuted} />
            )}
          </View>
        </View>
        <Text style={[styles.detailTitle, { color: t.text }]} numberOfLines={3}>{detail.title || '无题'}</Text>
        {!!authors && <Text style={[styles.detailSub, { color: t.textMuted }]} numberOfLines={1}>{authors}</Text>}
        {!!detail.publisher && <Text style={[styles.detailMeta, { color: t.textMuted }]}>{detail.publisher}</Text>}
        {!!detail.availableFormats && (
          <Text style={[styles.detailMeta, { color: t.textMuted }]}>可选格式：{detail.availableFormats || '—'}</Text>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: t.primary }]} onPress={onRead}>
            <Icon name="bookmark" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>阅读</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: t.inputBg, borderColor: t.border, borderWidth: 1 }]}
            onPress={onToggleShelf}
            disabled={!isLoggedIn || shelfState !== 'idle'}
          >
            <Icon name={inShelf ? 'bookmark' : 'bookmarkAdd'} size={18} color={isLoggedIn ? t.text : t.textMuted} />
            <Text style={[styles.actionBtnText, { color: isLoggedIn ? t.text : t.textMuted }]}>{inShelf ? '移除书架' : '加入书架'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: t.inputBg, borderColor: t.border, borderWidth: 1 }]}
            onPress={onDownload}
            disabled={!hasFile}
          >
            <Icon name="downloadRounded" size={18} color={hasFile ? t.text : t.textMuted} />
            <Text style={[styles.actionBtnText, { color: hasFile ? t.text : t.textMuted }]}>下载</Text>
          </TouchableOpacity>
        </View>
        {shelfHint ? (
          <Text style={[styles.hint, { color: t.primary }]}>{shelfHint}</Text>
        ) : !isLoggedIn ? (
          <Text style={[styles.hint, { color: t.textMuted }]}>提示：登录后可加入书架</Text>
        ) : null}
      </View>

      {!!detail.comments && (
        <View style={[styles.detailBody, { backgroundColor: t.card, borderColor: t.border }]}>
          <Text style={[styles.bodyTitle, { color: t.text }]}>简介</Text>
          <Text style={[styles.bodyText, { color: t.text }]}>{detail.comments}</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14 },
  errorBanner: { paddingHorizontal: 12, paddingVertical: 8 },
  errorBannerText: { fontSize: 13, textAlign: 'center' },
  scrollContent: { paddingTop: 12, paddingBottom: 32 },
  section: { marginBottom: 24 },
  sectionHeader: { paddingHorizontal: 16, marginBottom: 10 },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  emptyHint: { textAlign: 'center', marginVertical: 32, fontSize: 14 },
  detailHeader: { marginHorizontal: 12, borderRadius: 12, padding: 16 },
  detailCoverWrap: { alignItems: 'center', marginBottom: 12 },
  detailCover: { width: 140, height: 190, borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  detailCoverImg: { width: '100%', height: '100%' },
  detailTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  detailSub: { fontSize: 14, marginTop: 6, textAlign: 'center' },
  detailMeta: { fontSize: 12, marginTop: 4, textAlign: 'center' },
  actionRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 14 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18,
  },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12, textAlign: 'center', marginTop: 10 },
  detailBody: { marginHorizontal: 12, marginTop: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  bodyTitle: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  bodyText: { fontSize: 13, lineHeight: 20 },
  loginPrompt: { marginHorizontal: 12, marginBottom: 16, padding: 18, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  loginPromptTitle: { fontSize: 15, fontWeight: '700', marginTop: 8 },
  loginPromptSub: { fontSize: 12, marginTop: 4, textAlign: 'center' },
  loginPromptBtn: { marginTop: 12, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18 },
  loginPromptBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 12, marginBottom: 10, padding: 10, borderRadius: 12, borderWidth: 1,
  },
  searchCover: { width: 64, height: 88, borderRadius: 6, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  searchCoverImg: { width: '100%', height: '100%' },
  searchInfo: { flex: 1, marginHorizontal: 12 },
  searchTitle: { fontSize: 15, fontWeight: '600' },
  searchAuthor: { fontSize: 12, marginTop: 3 },
  searchIntro: { fontSize: 12, marginTop: 5, lineHeight: 17 },
})
