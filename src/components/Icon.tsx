import { View } from 'react-native'

import BackSvg from '@/icos/weui--back-filled.svg'
import HomeSvg from '@/icos/ph--house-line.svg'
import FileSvg from '@/icos/file.svg'
import SettingsSvg from '@/icos/lets-icons--setting-line-duotone.svg'
import SearchSvg from '@/icos/material-symbols--search.svg'
import RefreshSvg from '@/icos/material-symbols--refresh.svg'
import ViewListSvg from '@/icos/fa7-solid--list-squares.svg'
import ViewGridSvg from '@/icos/ph--squares-four.svg'
import MultiSelectSvg from '@/icos/material-symbols--check-box-outline.svg'
import FolderNewSvg from '@/icos/pajamas--folder-new.svg'
import UploadSvg from '@/icos/ri--upload-line.svg'
import SortArrowSvg from '@/icos/mynaui--arrow-up-down.svg'
import DownloadCloudSvg from '@/icos/streamline-kameleon-color--download-cloud.svg'
import FolderEmptySvg from '@/icos/glyphs-poly--folder.svg'
import FolderContentSvg from '@/icos/glyphs-poly--folder-1.svg'

import FileImageSvg from '@/icos/catppuccin--image.svg'
import FileVideoSvg from '@/icos/catppuccin--video.svg'
import FileAudioSvg from '@/icos/catppuccin--audio.svg'
import FileTextSvg from '@/icos/catppuccin--text.svg'
import FileArchiveSvg from '@/icos/catppuccin--zip.svg'
import FileCodeSvg from '@/icos/streamline-color--file-code-1.svg'
import FileDocumentSvg from '@/icos/material-icon-theme--document.svg'
import FilePdfSvg from '@/icos/material-icon-theme--pdf.svg'
import FileBookSvg from '@/icos/twemoji--blue-book.svg'

import DownloadRoundedSvg from '@/icos/material-symbols--download-rounded.svg'
import ShareManageSvg from '@/icos/jam--share.svg'

import FilebrowserLogo from '@/icos/filebrowser.svg'
import JellyfinLogo from '@/icos/selfhst--jellyfin.svg'
import NavidromeLogo from '@/icos/selfhst--navidrome.svg'
import AudiobookshelfLogo from '@/icos/selfhst--audiobookshelf.svg'
import ImmichLogo from '@/icos/selfhst--immich.svg'
import CalibreLogo from '@/icos/selfhst--calibre.svg'
import QbittorrentLogo from '@/icos/selfhst--qbittorrent.svg'
import OpenlistLogo from '@/icos/selfhst--openlist.svg'
import UnraidLogo from '@/icos/selfhst--unraid.svg'

type SvgComponent = React.ComponentType<{ width?: number; height?: number; fill?: string; color?: string; size?: number; style?: any }>

const SVG_COMPONENTS = {
  back: BackSvg,
  home: HomeSvg,
  file: FileSvg,
  settings: SettingsSvg,
  search: SearchSvg,
  refresh: RefreshSvg,
  viewList: ViewListSvg,
  viewGrid: ViewGridSvg,
  multiSelect: MultiSelectSvg,
  folderNew: FolderNewSvg,
  upload: UploadSvg,
  sortArrow: SortArrowSvg,
  downloadCloud: DownloadCloudSvg,
  folderEmpty: FolderEmptySvg,
  folderContent: FolderContentSvg,

  fileImage: FileImageSvg,
  fileVideo: FileVideoSvg,
  fileAudio: FileAudioSvg,
  fileText: FileTextSvg,
  fileArchive: FileArchiveSvg,
  fileCode: FileCodeSvg,
  fileDocument: FileDocumentSvg,
  filePdf: FilePdfSvg,
  fileBook: FileBookSvg,
  downloadRounded: DownloadRoundedSvg,
  shareManage: ShareManageSvg,

  filebrowser: FilebrowserLogo,
  jellyfin: JellyfinLogo,
  navidrome: NavidromeLogo,
  audiobookshelf: AudiobookshelfLogo,
  immich: ImmichLogo,
  calibre: CalibreLogo,
  qbittorrent: QbittorrentLogo,
  openlist: OpenlistLogo,
  unraid: UnraidLogo,
} as const

export type IconName = keyof typeof SVG_COMPONENTS

const MONO_ICONS: ReadonlySet<IconName> = new Set<IconName>([
  'back', 'home', 'file', 'settings', 'search', 'refresh',
  'viewList', 'viewGrid', 'multiSelect',
  'folderNew', 'upload', 'sortArrow', 'folderEmpty', 'folderContent',
  'downloadRounded', 'shareManage',
])

interface Props {
  name: IconName
  size?: number
  color?: string
  style?: any
}

export default function Icon({ name, size = 24, color, style }: Props) {
  const Cmp = SVG_COMPONENTS[name]
  const isMono = MONO_ICONS.has(name)
  const props: any = { width: size, height: size, style }
  if (isMono && color) props.color = color
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Cmp {...props} />
    </View>
  )
}