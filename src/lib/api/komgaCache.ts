import { File, Paths, Directory } from 'expo-file-system'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { KomgaServerConfig, KomgaPage } from '@/types'
import { komgaAuthHeader, komgaGetBookPages, komgaPageUrl } from '@/lib/api/komga'

const INDEX_KEY = 'komga:cache:index:v1'

interface CacheIndex {
  books: Record<string, { bookId: string; seriesTitle: string; bookTitle: string; pages: number; sizeBytes: number; cachedAt: number }>
  totalBytes: number
}

// ── 路径 ────────────────────────────────────────────────────────────────────

function cacheRoot(): Directory {
  // 用 cache 目录（系统可在空间不足时清理，但 v1 简化）
  return new Directory(Paths.cache, 'komga')
}

function bookDir(serverId: string, bookId: string): Directory {
  return new Directory(cacheRoot(), `${serverId}/${bookId}`)
}

function pageFile(serverId: string, bookId: string, pageNum: number): string {
  return `${bookDir(serverId, bookId).uri}/${pageNum}.bin`
}

// ── 索引 ────────────────────────────────────────────────────────────────────

let _index: CacheIndex | null = null
let _loadingIndex: Promise<CacheIndex> | null = null

async function loadIndex(): Promise<CacheIndex> {
  if (_index) return _index
  if (_loadingIndex) return _loadingIndex
  _loadingIndex = (async () => {
    try {
      const raw = await AsyncStorage.getItem(INDEX_KEY)
      _index = raw ? JSON.parse(raw) : { books: {}, totalBytes: 0 }
    } catch {
      _index = { books: {}, totalBytes: 0 }
    }
    _loadingIndex = null
    return _index!
  })()
  return _loadingIndex
}

async function saveIndex(idx: CacheIndex): Promise<void> {
  _index = idx
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(idx))
}

export async function getCacheStats(): Promise<{ totalBytes: number; bookCount: number }> {
  const idx = await loadIndex()
  return { totalBytes: idx.totalBytes, bookCount: Object.keys(idx.books).length }
}

export async function getCachedBookList(): Promise<Array<{ bookId: string; seriesTitle: string; bookTitle: string; pages: number; sizeBytes: number; cachedAt: number }>> {
  const idx = await loadIndex()
  return Object.values(idx.books).sort((a, b) => b.cachedAt - a.cachedAt)
}

// ── 单页下载 ────────────────────────────────────────────────────────────────

export async function ensurePageCached(server: KomgaServerConfig, serverId: string, bookId: string, pageNum: number): Promise<boolean> {
  try {
    const dir = bookDir(serverId, bookId)
    if (!dir.exists) {
      dir.create({ intermediates: true })
    }
    const file = new File(pageFile(serverId, bookId, pageNum))
    if (file.exists) return true

    const url = komgaPageUrl(server, bookId, pageNum)
    const res = await fetch(url, { headers: komgaAuthHeader(server) })
    if (!res.ok) return false
    const buf = new Uint8Array(await res.arrayBuffer())
    file.write(buf as any)
    return true
  } catch {
    return false
  }
}

// 触发后台预读（不 await，fire-and-forget）
export function prefetchPage(server: KomgaServerConfig, serverId: string, bookId: string, pageNum: number): void {
  void ensurePageCached(server, serverId, bookId, pageNum)
}

export function pageLocalUri(serverId: string, bookId: string, pageNum: number): string {
  return `file://${pageFile(serverId, bookId, pageNum)}`
}

export function isPageCached(serverId: string, bookId: string, pageNum: number): boolean {
  try {
    return new File(pageFile(serverId, bookId, pageNum)).exists
  } catch {
    return false
  }
}

// ── 整本缓存 ────────────────────────────────────────────────────────────────

export async function cacheBook(
  server: KomgaServerConfig,
  serverId: string,
  bookId: string,
  seriesTitle: string,
  bookTitle: string,
  onProgress?: (current: number, total: number) => void,
): Promise<{ ok: boolean; error?: string; sizeBytes: number }> {
  try {
    const pages = await komgaGetBookPages(server, bookId)
    if (!pages || pages.length === 0) return { ok: false, error: '无页面', sizeBytes: 0 }

    const dir = bookDir(serverId, bookId)
    if (!dir.exists) dir.create({ intermediates: true })

    let sizeBytes = 0
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i]
      const file = new File(pageFile(serverId, bookId, page.number))
      if (!file.exists) {
        const url = komgaPageUrl(server, bookId, page.number)
        const res = await fetch(url, { headers: komgaAuthHeader(server) })
        if (!res.ok) return { ok: false, error: `第 ${page.number} 页下载失败 HTTP ${res.status}`, sizeBytes }
        const buf = new Uint8Array(await res.arrayBuffer())
        file.write(buf as any)
        sizeBytes += buf.byteLength
      } else {
        sizeBytes += file.size ?? 0
      }
      onProgress?.(i + 1, pages.length)
    }

    // 更新索引
    const idx = await loadIndex()
    const key = `${serverId}:${bookId}`
    // 减去旧值，加上新值
    const old = idx.books[key]
    const oldBytes = old?.sizeBytes ?? 0
    idx.books[key] = {
      bookId,
      seriesTitle,
      bookTitle,
      pages: pages.length,
      sizeBytes,
      cachedAt: Date.now(),
    }
    idx.totalBytes = idx.totalBytes - oldBytes + sizeBytes
    await saveIndex(idx)
    return { ok: true, sizeBytes }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '缓存失败', sizeBytes: 0 }
  }
}

// ── 清除缓存 ────────────────────────────────────────────────────────────────

export async function clearBookCache(serverId: string, bookId: string): Promise<void> {
  const dir = bookDir(serverId, bookId)
  if (dir.exists) {
    // 递归删除目录
    try {
      const items = dir.list()
      for (const item of items) {
        if (item instanceof File) item.delete()
      }
    } catch {}
  }
  const idx = await loadIndex()
  const key = `${serverId}:${bookId}`
  const old = idx.books[key]
  if (old) {
    idx.totalBytes -= old.sizeBytes
    delete idx.books[key]
    await saveIndex(idx)
  }
}

export async function clearAllCache(): Promise<void> {
  const root = cacheRoot()
  if (root.exists) {
    try {
      const items = root.list()
      for (const item of items) {
        if (item instanceof Directory) {
          // 逐个 server 目录删除其内容
          try {
            for (const sub of item.list()) {
              if (sub instanceof File) sub.delete()
            }
          } catch {}
        }
      }
    } catch {}
  }
  await saveIndex({ books: {}, totalBytes: 0 })
}