import { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Dimensions } from 'react-native'
import type { JellyfinItem, JellyfinServerConfig } from '@/types'
import { jellyfinGetItem, jellyfinGetSeasons, jellyfinGetImageUrl } from '@/lib/api/jellyfin'
import { getCached, setCached } from '@/lib/api/jellyfinCache'
import { useTheme } from '@/lib/theme'
import JellyfinPoster from './JellyfinPoster'
import Icon from '@/components/Icon'

const { width: SCREEN_W } = Dimensions.get('window')
const BACKDROP_H = Math.round(SCREEN_W * 9 / 16)
const POSTER_W = (SCREEN_W - 32 - 12) / 3

interface Props {
  server: JellyfinServerConfig
  item: JellyfinItem
  onPlay: (item: JellyfinItem) => void
  onSeasonPress?: (seasonId: string, seasonNumber: number) => void
  onBack: () => void
}

function ticksToMinutes(ticks?: number): string {
  if (!ticks) return ''
  const mins = Math.round(ticks / 600000000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function JellyfinItemDetail({ server, item, onPlay, onSeasonPress, onBack }: Props) {
  const t = useTheme()
  const [detail, setDetail] = useState<JellyfinItem>(item)
  const [seasons, setSeasons] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [seasonError, setSeasonError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSeasons([])
    setSeasonError(null)
    const run = async () => {
      setLoading(true)

      const detailCacheKey = `itemDetail:${item.Id}`
      const cachedDetail = await getCached<JellyfinItem>(detailCacheKey)
      if (cachedDetail) setDetail(cachedDetail)

      const seasonsCacheKey = `seasons:${item.Id}`
      const cachedSeasons = await getCached<any[]>(seasonsCacheKey)
      if (cachedSeasons) { setSeasons(cachedSeasons); if (cachedDetail) setLoading(false) }

      const itemRes = await jellyfinGetItem(server, item.Id)
      if (cancelled) return
      if (itemRes.ok && itemRes.item) { setDetail(itemRes.item); await setCached(detailCacheKey, itemRes.item, 300000) }
      if (item.Type === 'Series' && itemRes.ok) {
        const seasonsRes = await jellyfinGetSeasons(server, item.Id)
        if (cancelled) return
        if (seasonsRes.ok) {
          setSeasons(seasonsRes.seasons ?? [])
          await setCached(seasonsCacheKey, seasonsRes.seasons ?? [], 300000)
          setSeasonError(null)
        } else {
          setSeasonError(seasonsRes.error || '未知错误')
        }
      }
      setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [server, item.Id, item.Type])

  const backdropUri = detail.BackdropImageTags?.[0]
    ? jellyfinGetImageUrl(server, detail.Id, 'Backdrop', detail.BackdropImageTags[0], Math.round(SCREEN_W * 2))
    : null

  const cast = (detail.People ?? []).filter((p) => p.Type === 'Actor').slice(0, 12)
  const genres = detail.Genres ?? []
  const isSeries = detail.Type === 'Series'
  const validSeasons = seasons
    .filter((s: any) => s.Type === 'Season')
    .sort((a: any, b: any) => (a.IndexNumber ?? a.SeasonNumber ?? 0) - (b.IndexNumber ?? b.SeasonNumber ?? 0))

  return (
    <ScrollView style={[styles.container, { backgroundColor: t.bg }]} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[styles.backdrop, { height: BACKDROP_H, backgroundColor: t.border }]}>
        {backdropUri ? (
          <JellyfinPoster
            server={server}
            itemId={detail.Id}
            imageTags={detail.ImageTags}
            backdropTag={detail.BackdropImageTags?.[0]}
            imageType="Backdrop"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        ) : (
          <View style={[styles.backdropPlaceholder, { backgroundColor: t.border }]}>
            <Icon name="film" size={48} color={t.textMuted} />
          </View>
        )}
        <View style={styles.backdropOverlay} />
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="back" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onPlay(detail)} style={[styles.playBtn, { backgroundColor: t.primary }]}>
          <Icon name="playCircle" size={28} color="#fff" />
          <Text style={styles.playBtnText}>播放</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { color: t.text }]}>{detail.Name}</Text>

        <View style={styles.metaRow}>
          {detail.ProductionYear ? <Text style={[styles.meta, { color: t.textMuted }]}>{detail.ProductionYear}</Text> : null}
          {detail.OfficialRating ? <Text style={[styles.meta, { color: t.textMuted }]}>· {detail.OfficialRating}</Text> : null}
          {detail.CommunityRating ? (
            <Text style={[styles.meta, { color: t.warning }]}>· ★ {detail.CommunityRating.toFixed(1)}</Text>
          ) : null}
          {detail.RunTimeTicks ? <Text style={[styles.meta, { color: t.textMuted }]}>· {ticksToMinutes(detail.RunTimeTicks)}</Text> : null}
        </View>

        {genres.length > 0 && (
          <View style={styles.genreRow}>
            {genres.map((g) => (
              <View key={g} style={[styles.genreChip, { backgroundColor: t.inputBg, borderColor: t.border }]}>
                <Text style={[styles.genreText, { color: t.textSecondary }]}>{g}</Text>
              </View>
            ))}
          </View>
        )}

        {detail.Overview ? (
          <Text style={[styles.overview, { color: t.textSecondary }]}>{detail.Overview}</Text>
        ) : null}

        {isSeries && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>
              {validSeasons.length > 0 ? `季 (${validSeasons.length})` : '季'}
            </Text>
            {loading && seasons.length === 0 ? (
              <ActivityIndicator size="small" color={t.primary} style={{ marginVertical: 20 }} />
            ) : seasonError ? (
              <Text style={[styles.empty, { color: t.textMuted }]}>季加载失败: {seasonError}</Text>
            ) : validSeasons.length === 0 ? (
              <Text style={[styles.empty, { color: t.textMuted }]}>暂无季</Text>
            ) : (
              <View style={styles.seasonsGrid}>
                {validSeasons.map((season) => {
                  const sn = season.IndexNumber ?? season.SeasonNumber ?? 0
                  const hasPrimary = !!season.ImageTags?.Primary
                  const hasBackdrop = !!season.BackdropImageTags?.[0]
                  return (
                    <TouchableOpacity
                      key={season.Id}
                      style={[styles.seasonCard, { width: POSTER_W }]}
                      activeOpacity={0.7}
                      onPress={() => onSeasonPress?.(season.Id, sn)}
                    >
                      <JellyfinPoster
                        server={server}
                        itemId={season.Id}
                        imageTags={season.ImageTags}
                        backdropTag={season.BackdropImageTags?.[0]}
                        imageType={hasPrimary ? 'Primary' : 'Backdrop'}
                        aspectRatio={hasPrimary ? undefined : 16 / 9}
                        width={POSTER_W}
                        style={{ borderRadius: 8 }}
                      />
                      <Text style={[styles.seasonTitle, { color: t.text }]} numberOfLines={1}>
                        {sn === 0 ? '特别篇' : `第 ${sn} 季`}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}
          </View>
        )}

        {cast.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>演员</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.castScroll}>
              {cast.map((p, i) => (
                <View key={`${p.Name}-${i}`} style={styles.castItem}>
                  <View style={[styles.castAvatar, { backgroundColor: t.border }]}>
                    <Text style={[styles.castAvatarText, { color: t.textMuted }]}>
                      {p.Name?.charAt(0)?.toUpperCase() || '?'}
                    </Text>
                  </View>
                  <Text style={[styles.castName, { color: t.text }]} numberOfLines={2}>{p.Name}</Text>
                  {p.Role ? <Text style={[styles.castRole, { color: t.textMuted }]} numberOfLines={1}>{p.Role}</Text> : null}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>信息</Text>
          <View style={[styles.infoRow, { borderBottomColor: t.border }]}>
            <Text style={[styles.infoLabel, { color: t.textMuted }]}>类型</Text>
            <Text style={[styles.infoValue, { color: t.text }]}>
              {detail.Type === 'Movie' ? '电影' : detail.Type === 'Series' ? '剧集' : detail.Type === 'Episode' ? '单集' : detail.Type}
            </Text>
          </View>
          {detail.Studios && detail.Studios.length > 0 && (
            <View style={[styles.infoRow, { borderBottomColor: t.border }]}>
              <Text style={[styles.infoLabel, { color: t.textMuted }]}>工作室</Text>
              <Text style={[styles.infoValue, { color: t.text }]}>{detail.Studios.map(s => s.Name).join(', ')}</Text>
            </View>
          )}
          {detail.SeriesName && (
            <View style={[styles.infoRow, { borderBottomColor: t.border }]}>
              <Text style={[styles.infoLabel, { color: t.textMuted }]}>所属剧集</Text>
              <Text style={[styles.infoValue, { color: t.text }]}>{detail.SeriesName}</Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backdrop: { width: '100%', position: 'relative' },
  backdropPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backdropOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  backBtn: { position: 'absolute', top: 40, left: 12, padding: 8, zIndex: 10 },
  playBtn: {
    position: 'absolute', bottom: 16, right: 16,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24,
  },
  playBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', marginLeft: 6 },
  body: { paddingHorizontal: 16, paddingTop: 16 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
  meta: { fontSize: 13 },
  genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  genreChip: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  genreText: { fontSize: 12 },
  overview: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  seasonsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  seasonCard: {},
  seasonTitle: { fontSize: 13, fontWeight: '500', marginTop: 6, textAlign: 'center' },
  empty: { fontSize: 14, paddingVertical: 20 },
  castScroll: { paddingRight: 16, gap: 12 },
  castItem: { width: 72, marginRight: 12 },
  castAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  castAvatarText: { fontSize: 22, fontWeight: '600' },
  castName: { fontSize: 12, fontWeight: '500', textAlign: 'center' },
  castRole: { fontSize: 10, textAlign: 'center', marginTop: 2 },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: '500', flex: 1, textAlign: 'right' },
})
