import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'

interface Props {
  onMenuPress: () => void
  searchQuery: string
  onSearchChange: (text: string) => void
  onSubmitSearch: () => void
  onClearSearch: () => void
  showBack: boolean
  onBackPress: () => void
  placeholder?: string
}

export default function KomgaHeader({
  onMenuPress,
  searchQuery,
  onSearchChange,
  onSubmitSearch,
  onClearSearch,
  showBack,
  onBackPress,
  placeholder = '搜索漫画或章节...',
}: Props) {
  const t = useTheme()
  return (
    <View style={[styles.header, { backgroundColor: t.card, borderBottomColor: t.border }]}>
      {showBack ? (
        <TouchableOpacity onPress={onBackPress} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="back" size={24} color={t.text} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={onMenuPress} style={styles.menuBtn}>
          <Icon name="menu" size={24} color={t.text} />
        </TouchableOpacity>
      )}
      <View style={[styles.searchWrap, { backgroundColor: t.inputBg, borderColor: t.border }]}>
        <Icon name="search" size={16} color={t.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: t.text }]}
          placeholder={placeholder}
          placeholderTextColor={t.textMuted}
          value={searchQuery}
          onChangeText={onSearchChange}
          onSubmitEditing={onSubmitSearch}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={onClearSearch} style={styles.clearBtn}>
            <Icon name="x" size={16} color={t.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 6, marginRight: 4 },
  menuBtn: { padding: 6, marginRight: 4 },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, height: 36,
  },
  searchInput: { flex: 1, fontSize: 14, marginLeft: 6, paddingVertical: 0 },
  clearBtn: { padding: 4 },
})