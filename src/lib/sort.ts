import { FileItem } from '@/types'
import { FileSort } from '@/stores/appStore'

export function sortFiles(items: FileItem[], sort: FileSort): FileItem[] {
  const dirs = items.filter((item) => item.isDirectory)
  const files = items.filter((item) => !item.isDirectory)
  const compare = (a: FileItem, b: FileItem) => {
    let cmp = 0
    if (sort.by === 'size') cmp = a.size - b.size
    else if (sort.by === 'modified') cmp = (a.modified ?? '').localeCompare(b.modified ?? '')
    else cmp = a.name.localeCompare(b.name, undefined, { numeric: true })
    return sort.dir === 'asc' ? cmp : -cmp
  }
  return [...dirs.sort(compare), ...files.sort(compare)]
}

export interface FolderEntry {
  name: string
  size: number
  modified: string
}

export type FolderSortBy = 'name' | 'size' | 'modified'
export interface FolderSort {
  by: FolderSortBy
  dir: 'asc' | 'desc'
}

export function sortFolderEntries(entries: FolderEntry[], sort: FolderSort): FolderEntry[] {
  const arr = [...entries]
  const cmp = (a: FolderEntry, b: FolderEntry) => {
    if (sort.by === 'size') return a.size - b.size
    if (sort.by === 'modified') return (a.modified ?? '').localeCompare(b.modified ?? '')
    return a.name.localeCompare(b.name, undefined, { numeric: true })
  }
  arr.sort(cmp)
  if (sort.dir === 'desc') arr.reverse()
  return arr
}
