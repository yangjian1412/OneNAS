import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import type { JellyfinItem, JellyfinServerConfig } from '@/types'
import { useTheme } from '@/lib/theme'
import JellyfinPoster from './JellyfinPoster'

interface Props {
  server: JellyfinServerConfig
  item: JellyfinItem
  direction: 'horizontal' | 'vertical'
  onPress?: () => void
}

export default function JellyfinItemCard({ server, item, direction, onPress }: Props) {
  const t = useTheme()
  if (!server) return null
  const isHorizontal = direction === 'horizontal'
  const posTicks = item.UserData?.PlaybackPositionTicks
  const totalTicks = item.UserData?.TotalRuntimeTicks || item.RunTimeTicks
  const pct = posTicks && totalTicks
    ? Math.round((posTicks / totalTicks) * 100)
    : 0

  // For episodes, prefer series-level images when item has none
  const isEpisode = item.Type === 'Episode'
  const fallbackId = (isEpisode && item.SeriesId) || item.Id
  const primaryImageTags = isEpisode && !item.ImageTags?.Primary && item.SeriesPrimaryImageTag
    ? { Primary: item.SeriesPrimaryImageTag }
    : item.ImageTags
  const backdropTag = item.BackdropImageTags?.[0]
    || (isEpisode ? item.SeriesBackdropImageTag : undefined)

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={isHorizontal ? styles.hCard : styles.vCard}
    >
      {isHorizontal ? (
        <>
          <View style={[styles.hPosterWrap, { borderRadius: 8 }]}>
            <JellyfinPoster
              server={server}
              itemId={fallbackId}
              imageTags={primaryImageTags}
              backdropTag={backdropTag}
              imageType="Backdrop"
              width={240}
            />
            {pct > 0 && (
              <View style={[styles.progressBar, { backgroundColor: t.border }]}>
                <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: t.primary }]} />
              </View>
            )}
          </View>
          <Text style={[styles.hTitle, { color: t.text }]} numberOfLines={1}>{item.Name}</Text>
          {item.SeriesName && (
            <Text style={[styles.hMeta, { color: t.textMuted }]} numberOfLines={1}>{item.SeriesName}</Text>
          )}
        </>
      ) : (
        <>
          <JellyfinPoster
            server={server}
            itemId={fallbackId}
            imageTags={primaryImageTags}
            backdropTag={backdropTag}
            imageType="Primary"
          />
          <Text style={[styles.vTitle, { color: t.text }]} numberOfLines={2}>{item.Name}</Text>
          {item.ProductionYear && (
            <Text style={[styles.vYear, { color: t.textMuted }]}>{item.ProductionYear}</Text>
          )}
        </>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  hCard: { width: 240, marginRight: 10 },
  hPosterWrap: { overflow: 'hidden' },
  progressBar: { height: 3, borderRadius: 1.5, marginTop: -3 },
  progressFill: { height: 3, borderRadius: 1.5 },
  hTitle: { fontSize: 13, fontWeight: '600', marginTop: 6 },
  hMeta: { fontSize: 11, marginTop: 2 },
  vCard: { flex: 1, marginBottom: 12 },
  vTitle: { fontSize: 12, fontWeight: '600', marginTop: 6, paddingHorizontal: 2 },
  vYear: { fontSize: 11, marginTop: 2, paddingHorizontal: 2 },
})
