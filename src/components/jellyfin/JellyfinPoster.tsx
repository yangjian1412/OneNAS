import { useState } from 'react'
import { View, Image, LayoutChangeEvent, StyleSheet } from 'react-native'
import { jellyfinGetImageUrl } from '@/lib/api/jellyfin'
import type { JellyfinServerConfig } from '@/types'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'

const RATIOS: Record<string, number> = {
  Primary: 0.667,
  Backdrop: 1.778,
  Logo: 1,
}

interface Props {
  server: JellyfinServerConfig
  itemId: string
  imageTags?: Record<string, string> | null
  backdropTag?: string
  imageType?: 'Primary' | 'Backdrop' | 'Logo'
  width?: number
  aspectRatio?: number
  style?: any
}

export default function JellyfinPoster({ server, itemId, imageTags, backdropTag, imageType = 'Primary', width: explicitW, aspectRatio, style }: Props) {
  const t = useTheme()
  const [measuredW, setMeasuredW] = useState(0)
  const w = explicitW || measuredW
  const ratio = aspectRatio || RATIOS[imageType] || 0.667
  const h = w ? w / ratio : 0

  const tag = imageType === 'Backdrop'
    ? (backdropTag || imageTags?.Backdrop)
    : imageTags?.[imageType]

  const uri = itemId && server
    ? jellyfinGetImageUrl(server, itemId, imageType, tag || undefined, Math.round((w || 200) * 3))
    : null

  const handleLayout = (e: LayoutChangeEvent) => {
    if (!explicitW) setMeasuredW(e.nativeEvent.layout.width)
  }

  return (
    <View onLayout={handleLayout} style={[{ backgroundColor: t.border, overflow: 'hidden' }, style]}>
      {w > 0 && h > 0 && uri ? (
        <Image
          source={{ uri }}
          style={{ width: w, height: h }}
          resizeMode="cover"
        />
      ) : w > 0 && h > 0 ? (
        <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="film" size={h > 120 ? 40 : 24} color={t.textMuted} />
        </View>
      ) : null}
    </View>
  )
}
