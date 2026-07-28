import { View, TextInput, TouchableOpacity, StyleSheet, Platform, StatusBar } from 'react-native'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'

interface Props {
  onMenuPress: () => void
  searchQuery: string
  onSearchChange: (text: string) => void
  onSubmitSearch: () => void
  onClearSearch: () => void
  showBack: boolean
}

export default function JellyfinHeader({ onMenuPress, searchQuery, onSearchChange, onSubmitSearch, onClearSearch, showBack }: Props) {
  const t = useTheme()
  const pt = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0

  return (
    <View style={[styles.header, { backgroundColor: t.card, borderBottomColor: t.border, paddingTop: pt + 8 }]}>
      <TouchableOpacity onPress={onMenuPress} style={styles.menuBtn}>
        <Icon name="menu" size={24} color={t.text} />
      </TouchableOpacity>
      <View style={[styles.searchWrap, { backgroundColor: t.inputBg, borderColor: t.border }]}>
        <Icon name="search" size={16} color={t.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: t.text }]}
          placeholder="搜索电影、剧集..."
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
    paddingHorizontal: 8, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuBtn: { padding: 6, marginRight: 4 },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, height: 36,
  },
  searchInput: { flex: 1, fontSize: 14, marginLeft: 6, paddingVertical: 0 },
  clearBtn: { padding: 4 },
})
