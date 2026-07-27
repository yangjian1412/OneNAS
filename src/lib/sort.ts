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
