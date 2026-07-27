import { IconName } from '@/components/Icon'

const EXTENSION_MAP: Record<string, IconName> = {
  jpg: 'fileImage', jpeg: 'fileImage', png: 'fileImage', gif: 'fileImage',
  webp: 'fileImage', bmp: 'fileImage', svg: 'fileImage', ico: 'fileImage',
  heic: 'fileImage', heif: 'fileImage', tiff: 'fileImage', tif: 'fileImage',

  mp4: 'fileVideo', mkv: 'fileVideo', avi: 'fileVideo', mov: 'fileVideo',
  wmv: 'fileVideo', flv: 'fileVideo', webm: 'fileVideo', m4v: 'fileVideo',
  mpg: 'fileVideo', mpeg: 'fileVideo',

  mp3: 'fileAudio', flac: 'fileAudio', wav: 'fileAudio', aac: 'fileAudio',
  ogg: 'fileAudio', m4a: 'fileAudio', wma: 'fileAudio', opus: 'fileAudio',

  txt: 'fileText', md: 'fileText', log: 'fileText', yml: 'fileText',
  yaml: 'fileText', json: 'fileText', xml: 'fileText', csv: 'fileText',
  ini: 'fileText', cfg: 'fileText', conf: 'fileText', toml: 'fileText',
  env: 'fileText', gitignore: 'fileText',

  zip: 'fileArchive', rar: 'fileArchive', '7z': 'fileArchive', tar: 'fileArchive',
  gz: 'fileArchive', bz2: 'fileArchive', xz: 'fileArchive', tgz: 'fileArchive',

  js: 'fileCode', ts: 'fileCode', py: 'fileCode', java: 'fileCode',
  go: 'fileCode', rs: 'fileCode', c: 'fileCode', cpp: 'fileCode',
  h: 'fileCode', css: 'fileCode', html: 'fileCode', php: 'fileCode',
  swift: 'fileCode', kt: 'fileCode', sh: 'fileCode', bash: 'fileCode',
  rb: 'fileCode', pl: 'fileCode', lua: 'fileCode', dart: 'fileCode',
  sql: 'fileCode', r: 'fileCode', scala: 'fileCode',

  pdf: 'fileDocument', doc: 'fileDocument', docx: 'fileDocument',
  xls: 'fileDocument', xlsx: 'fileDocument', ppt: 'fileDocument',
  pptx: 'fileDocument',

  epub: 'fileBook', mobi: 'fileBook', azw3: 'fileBook', fb2: 'fileBook',
  ibook: 'fileBook', cbz: 'fileBook', cbr: 'fileBook',
}

export function getFileIcon(fileName: string): IconName {
  const parts = fileName.split('.')
  if (parts.length < 2) return 'file'
  const ext = parts[parts.length - 1].toLowerCase()
  return EXTENSION_MAP[ext] ?? 'file'
}
