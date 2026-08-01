import { View, TextInput, TouchableOpacity, Text } from 'react-native'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'

interface Props {
  isHome: boolean
  searchQuery: string
  onChangeSearch: (q: string) => void
  onSubmitSearch: () => void
  onClearSearch: () => void
  onMenu: () => void
  onBack: () => void
  onSearchFocus: () => void
}

export default function AudiobookshelfHeader({
  isHome,
  searchQuery,
  onChangeSearch,
  onSubmitSearch,
  onClearSearch,
  onMenu,
  onBack,
  onSearchFocus,
}: Props) {
  const t = useTheme()
  return (
    <View style={[styles.header, { backgroundColor: t.bg, borderBottomColor: t.border }]}>
      <TouchableOpacity onPress={isHome ? onMenu : onBack} style={styles.btn} hitSlop={8}>
        <Icon name={isHome ? 'menu' : 'chevronLeft'} size={24} color={t.text} />
      </TouchableOpacity>
      <View style={[styles.searchBox, { backgroundColor: t.inputBg, borderColor: t.border }]}>
        <Icon name="search" size={18} color={t.textMuted} />
        <TextInput
          style={[styles.input, { color: t.text }]}
          placeholder="搜索有声书、播客、作者…"
          placeholderTextColor={t.textMuted}
          value={searchQuery}
          onChangeText={onChangeSearch}
          onFocus={onSearchFocus}
          onSubmitEditing={onSubmitSearch}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={onClearSearch} hitSlop={8}>
            <Icon name="x" size={18} color={t.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const styles = {
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    gap: 6,
  },
  btn: { width: 40, height: 40, justifyContent: 'center' as const, alignItems: 'center' as const },
  searchBox: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: 20,
    paddingHorizontal: 10,
    height: 36,
    borderWidth: 1,
    gap: 6,
  },
  input: { flex: 1, fontSize: 14, paddingVertical: 0 },
}