import { useState } from 'react'
import { View, Image, LayoutChangeEvent, StyleSheet } from 'react-native'
import { navidromeGetCoverArtUrl } from '@/lib/api/navidrome'
import type { NavidromeServerConfig } from '@/types'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'

interface Props {
  server: NavidromeServerConfig | null
  coverArtId?: string
  width?: number
  aspectRatio?: number
  style?: any
}

export default function NavidromeCoverArt({ server, coverArtId, width: explicitW, aspectRatio = 1, style }: Props) {
  const t = useTheme()
  const [measuredW, setMeasuredW] = useState(0)
  const w = explicitW ?? measuredW
  const h = w ? w / aspectRatio : 0
  const uri = server ? navidromeGetCoverArtUrl(server, coverArtId, Math.max(120, Math.round(w * 2))) : null

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => { if (explicitW == null) setMeasuredW(e.nativeEvent.layout.width) }}
      style={[{ backgroundColor: t.border, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}
    >
      {w > 0 && h > 0 && uri ? (
        <Image source={{ uri }} style={{ width: w, height: h }} resizeMode="cover" />
      ) : w > 0 && h > 0 ? (
        <Icon name="folderEmpty" size={Math.min(40, h * 0.4)} color={t.textMuted} />
      ) : null}
    </View>
  )
}