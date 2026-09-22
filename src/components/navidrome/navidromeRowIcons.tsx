import { View, TouchableOpacity } from 'react-native'
import { useTheme } from '@/lib/theme'

// Shared row-level icons for Navidrome screens. Visual spec is identical to
// FileScreen.tsx (see moreButton / moreDot / checkboxWrap / checkboxInner) so
// FileBrowser users get a consistent feel without needing a separate icon set.

interface MoreButtonProps {
  onPress: () => void
  size?: number
  color?: string
}

export function MoreButton({ onPress, size = 36, color }: MoreButtonProps) {
  const t = useTheme()
  const dotColor = color ?? t.textMuted
  const dotSize = Math.max(3, Math.round(size * (4 / 36)))
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={{
        width: size,
        height: size,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-evenly',
        paddingHorizontal: 4,
      }}
    >
      <View style={{ width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: dotColor }} />
      <View style={{ width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: dotColor }} />
      <View style={{ width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: dotColor }} />
    </TouchableOpacity>
  )
}

interface CheckboxProps {
  selected: boolean
  onPress?: () => void
  size?: number
}

export function Checkbox({ selected, onPress, size = 22 }: CheckboxProps) {
  const t = useTheme()
  const innerSize = Math.round(size * (12 / 22))
  const borderWidth = Math.max(1, Math.round(size * (1.5 / 22)))
  const inner = (
    <View
      style={{
        width: size,
        height: size,
        borderWidth,
        borderRadius: 4,
        borderColor: selected ? t.primary : t.textMuted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {selected ? (
        <View
          style={{
            width: innerSize,
            height: innerSize,
            borderRadius: 2,
            backgroundColor: t.primary,
          }}
        />
      ) : null}
    </View>
  )
  if (!onPress) return inner
  return (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      {inner}
    </TouchableOpacity>
  )
}
