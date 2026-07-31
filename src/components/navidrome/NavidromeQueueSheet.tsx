import { View, Text, TouchableOpacity, Modal, FlatList, Image, StyleSheet } from 'react-native'
import { useNavidromePlayerStore } from '@/stores/navidromePlayerStore'
import { useTheme } from '@/lib/theme'
import { navidromeGetCoverArtUrl } from '@/lib/api/navidrome'
import { getServer, playAt, removeFromQueue } from '@/lib/audioController'
import Icon from '@/components/Icon'

interface Props {
  visible: boolean
  onClose: () => void
}

export default function NavidromeQueueSheet({ visible, onClose }: Props) {
  const t = useTheme()
  const queue = useNavidromePlayerStore((s) => s.queue)
  const currentIndex = useNavidromePlayerStore((s) => s.currentIndex)
  const server = getServer()

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: t.card }]} onStartShouldSetResponder={() => true}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: t.text }]}>播放队列</Text>
            <Text style={[styles.count, { color: t.textMuted }]}>{queue.length} 首</Text>
          </View>
          <FlatList
            data={queue}
            keyExtractor={(item, i) => item.id ?? String(i)}
            renderItem={({ item, index }) => {
              const isCurrent = index === currentIndex
              const cover = server ? navidromeGetCoverArtUrl(server, item.coverArt, 80) : undefined
              return (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => { playAt(index); onClose() }}
                  style={[
                    styles.row,
                    { backgroundColor: isCurrent ? (t.primary + '15') : 'transparent', borderBottomColor: t.border },
                  ]}
                >
                  {isCurrent ? (
                    <Icon name="music" size={20} color={t.primary} style={styles.leadingIcon} />
                  ) : (
                    <Text style={[styles.index, { color: t.textMuted }]}>{index + 1}</Text>
                  )}
                  {cover ? (
                    <Image source={{ uri: cover }} style={styles.cover} />
                  ) : (
                    <View style={[styles.cover, { backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }]}>
                      <Icon name="music" size={14} color="#fff" />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.title, { color: isCurrent ? t.primary : t.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.artist, { color: t.textMuted }]} numberOfLines={1}>
                      {item.artist ?? '未知艺术家'}
                    </Text>
                  </View>
                  {index !== currentIndex && (
                    <TouchableOpacity
                      onPress={() => removeFromQueue(index)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.removeBtn}
                    >
                      <Icon name="x" size={18} color={t.textMuted} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              )
            }}
            ListEmptyComponent={
              <Text style={{ color: t.textMuted, textAlign: 'center', marginVertical: 24 }}>队列为空</Text>
            }
          />
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { height: '70%', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#888', alignSelf: 'center', marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#8884' },
  title: { fontSize: 17, fontWeight: '700' },
  count: { fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  leadingIcon: { width: 24, marginRight: 4, alignItems: 'center' },
  index: { width: 24, fontSize: 13, textAlign: 'center' },
  cover: { width: 36, height: 36, borderRadius: 4, marginLeft: 6 },
  title: { fontSize: 14, fontWeight: '600' },
  artist: { fontSize: 11, marginTop: 1 },
  removeBtn: { padding: 6 },
})