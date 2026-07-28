import { View, Text, TouchableOpacity, FlatList, StyleSheet, Dimensions } from 'react-native'
import type { JellyfinItem, JellyfinServerConfig } from '@/types'
import { useTheme } from '@/lib/theme'
import JellyfinPoster from './JellyfinPoster'
import Icon from '@/components/Icon'

const { width: SCREEN_W } = Dimensions.get('window')
const THUMB_W = Math.round(SCREEN_W * 0.35)

function ticksToMinutes(ticks?: number): string {
  if (!ticks) return ''
  const mins = Math.round(ticks / 600000000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

interface Props {
  server: JellyfinServerConfig
  episodes: JellyfinItem[]
  onEpisodePress: (item: JellyfinItem) => void
}

export default function JellyfinEpisodeList({ server, episodes, onEpisodePress }: Props) {
  const t = useTheme()
  if (!server) return null

  if (episodes.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={[styles.empty, { color: t.textMuted }]}>暂无剧集</Text>
      </View>
    )
  }

  const renderItem = ({ item }: { item: JellyfinItem }) => {
    const pct = item.UserData?.PlaybackPositionTicks && item.UserData?.TotalRuntimeTicks
      ? Math.round((item.UserData.PlaybackPositionTicks / item.UserData.TotalRuntimeTicks) * 100)
      : 0

    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: t.border }]}
        activeOpacity={0.7}
        onPress={() => onEpisodePress(item)}
      >
        <View style={[styles.thumb, { width: THUMB_W, height: Math.round(THUMB_W * 9 / 16), backgroundColor: t.border }]}>
          <JellyfinPoster
            server={server}
            itemId={item.Id}
            imageTags={item.ImageTags}
            backdropTag={item.BackdropImageTags?.[0]}
            imageType="Backdrop"
            width={THUMB_W}
            aspectRatio={16 / 9}
            style={{ borderRadius: 6 }}
          />
          {pct > 0 && (
            <View style={[styles.progressBar, { backgroundColor: t.border }]}>
              <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: t.primary }]} />
            </View>
          )}
        </View>
        <View style={styles.info}>
          <View style={styles.titleRow}>
            <Text style={[styles.epNum, { color: t.primary }]}>
              {item.IndexNumber != null ? `第 ${item.IndexNumber} 集` : ''}
            </Text>
            <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{item.Name}</Text>
          </View>
          {item.Overview ? (
            <Text style={[styles.overview, { color: t.textMuted }]} numberOfLines={2}>
              {item.Overview}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            {item.RunTimeTicks ? <Text style={[styles.meta, { color: t.textMuted }]}>{ticksToMinutes(item.RunTimeTicks)}</Text> : null}
            {item.CommunityRating ? <Text style={[styles.meta, { color: t.warning }]}> ★ {item.CommunityRating.toFixed(1)}</Text> : null}
          </View>
        </View>
        <Icon name="chevronRight" size={18} color={t.textMuted} style={{ alignSelf: 'center' }} />
      </TouchableOpacity>
    )
  }

  return (
    <FlatList
      data={episodes}
      renderItem={renderItem}
      keyExtractor={(item) => item.Id}
      contentContainerStyle={styles.list}
    />
  )
}

const styles = StyleSheet.create({
  list: { paddingBottom: 32 },
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumb: { borderRadius: 6, overflow: 'hidden', position: 'relative' },
  progressBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3 },
  progressFill: { height: 3 },
  info: { flex: 1, marginLeft: 12, paddingTop: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 },
  epNum: { fontSize: 13, fontWeight: '700', marginRight: 6 },
  title: { fontSize: 14, fontWeight: '600', flex: 1 },
  overview: { fontSize: 12, lineHeight: 16, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  meta: { fontSize: 11, marginRight: 8 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  empty: { fontSize: 14 },
})