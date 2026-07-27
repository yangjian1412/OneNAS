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

  pdf: 'filePdf', doc: 'fileDocument', docx: 'fileDocument',
  xls: 'fileDocument', xlsx: 'fileDocument', ppt: 'fileDocument',
  pptx: 'fileDocument',

  epub: 'fileBook', mobi: 'fileBook', azw3: 'fileBook', fb2: 'fileBook',
  ibook: 'fileBook', cbz: 'fileBook', cbr: 'fileBook',
}

const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','svg','ico','heic','heif','tiff','tif'])
const VIDEO_EXTS = new Set(['mp4','mkv','avi','mov','wmv','flv','webm','m4v','mpg','mpeg'])
const AUDIO_EXTS = new Set(['mp3','flac','wav','aac','ogg','m4a','wma','opus'])
const TEXT_EXTS = new Set(['txt','md','log','yml','yaml','json','xml','csv','ini','cfg','conf','toml','env','gitignore',
  'js','ts','jsx','tsx','py','java','go','rs','c','cpp','h','hpp','css','html','htm','php','swift','kt','sh','bash',
  'rb','pl','lua','dart','sql','r','scala','zig','tex','ps1','bat','cmd','makefile','dockerfile','gradle','vue','svelte'])

export type FileCategory = 'text' | 'image' | 'html' | 'pdf' | 'system' | 'video' | 'audio' | 'other'

export function getFileCategory(fileName: string): FileCategory {
  const parts = fileName.split('.')
  if (parts.length < 2) return 'other'
  const ext = parts[parts.length - 1].toLowerCase()
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (ext === 'html' || ext === 'htm') return 'html'
  if (ext === 'pdf') return 'pdf'
  if (['doc','docx','xls','xlsx','ppt','pptx'].includes(ext)) return 'system'
  if (VIDEO_EXTS.has(ext)) return 'video'
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (TEXT_EXTS.has(ext)) return 'text'
  return 'other'
}

export function getFileIcon(fileName: string): IconName {
  const parts = fileName.split('.')
  if (parts.length < 2) return 'file'
  const ext = parts[parts.length - 1].toLowerCase()
  return EXTENSION_MAP[ext] ?? 'file'
}
