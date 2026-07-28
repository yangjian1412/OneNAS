import { View, Image, StyleSheet } from 'react-native'
import { jellyfinGetImageUrl } from '@/lib/api/jellyfin'
import type { JellyfinServerConfig } from '@/types'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'

interface Props {
  server: JellyfinServerConfig
  itemId: string
  imageTags?: Record<string, string> | null
  backdropTag?: string
  imageType?: 'Primary' | 'Backdrop' | 'Logo'
  size?: 'small' | 'medium' | 'large'
  style?: any
}

export default function JellyfinPoster({ server, itemId, imageTags, backdropTag, imageType = 'Primary', size = 'medium', style }: Props) {
  const t = useTheme()
  const dims = { small: 80, medium: 120, large: 160 }
  const dim = dims[size]
  const isWide = imageType === 'Backdrop'
  const width = isWide ? dim * 1.78 : dim * 0.67
  const posterDim = isWide ? dim : dim * 1.5
  const tag = imageType === 'Backdrop'
    ? (backdropTag || imageTags?.Backdrop)
    : imageTags?.[imageType]

  const uri = tag
    ? jellyfinGetImageUrl(server, itemId, imageType, tag, Math.round(width * 2))
    : jellyfinGetImageUrl(server, itemId, imageType, undefined, Math.round(width * 2))

  return (
    <View style={[styles.wrapper, { width, height: posterDim, borderRadius: 8, backgroundColor: t.border }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.image, { width, height: posterDim, borderRadius: 8 }]}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.placeholder, { width, height: posterDim, borderRadius: 8 }]}>
          <Icon name="film" size={size === 'large' ? 40 : 24} color={t.textMuted} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { overflow: 'hidden' },
  image: {},
  placeholder: { alignItems: 'center', justifyContent: 'center' },
})
