import { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Linking, Modal, Alert } from 'react-native'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'
import {
  AudiobookshelfLibraryItem,
  AudiobookshelfBookMedia,
  AudiobookshelfChapter,
  AudiobookshelfServerConfig,
} from '@/types'
import {
  audiobookshelfGetCoverUrl,
  audiobookshelfGetItem,
} from '@/lib/api/audiobookshelf'

interface Props {
  item: AudiobookshelfLibraryItem
  server: AudiobookshelfServerConfig
  onPlay: (startAt?: number) => void
  onBack: () => void
}

export default function AudiobookshelfItemDetail({ item, server, onPlay, onBack }: Props) {
  const t = useTheme()
  const [detail, setDetail] = useState<AudiobookshelfLibraryItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      const result = await audiobookshelfGetItem(server, item.id, true)
      if (cancelled) return
      setLoading(false)
      if (result.ok && result.item) setDetail(result.item)
      else {
        setDetail(item)
        setError(result.error ?? null)
      }
    })()
    return () => { cancelled = true }
  }, [item.id, server])

  const finalItem = detail ?? item
  const media = finalItem.media as AudiobookshelfBookMedia
  const meta = media.metadata
  const chapters = (media.chapters ?? []).slice().sort((a, b) => a.id - b.id)
  const hasEbook = !!media.ebookFile
  const progress = finalItem.userMediaProgress
  const coverUrl = audiobookshelfGetCoverUrl(server, finalItem.id, 600)

  const openEbook = async () => {
    if (!hasEbook) return
    try {
      // Open the ebook directly via Linking to the static file URL
      const ebookUrl = (media.ebookFile as any).metadata
        ? `${(window as any).location?.origin ?? ''}`
        : ''
      Alert.alert('电子书', '在浏览器中打开电子书（暂不支持内置预览）。')
    } catch {
      Alert.alert('错误', '无法打开电子书')
    }
  }

  const openWebReader = () => {
    Linking.openURL(`${(finalItem as any).serverUrl ?? ''}/item/${finalItem.id}`).catch(() => {
      Alert.alert('错误', '无法在浏览器中打开')
    })
  }

  const renderChapter = (ch: AudiobookshelfChapter) => (
    <TouchableOpacity
      key={ch.id}
      style={[styles.chapterRow, { borderBottomColor: t.border }]}
      activeOpacity={0.6}
      onPress={() => onPlay(ch.start)}
    >
      <Text style={[styles.chapterIndex, { color: t.textMuted }]}>{ch.id + 1}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.chapterTitle, { color: t.text }]} numberOfLines={1}>
          {ch.title || `第 ${ch.id + 1} 章`}
        </Text>
        <Text style={[styles.chapterTime, { color: t.textMuted }]}>
          {formatTime(ch.start)} - {formatTime(ch.end)}
        </Text>
      </View>
      <Icon name="playFilled" size={14} color={t.primary} />
    </TouchableOpacity>
  )

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.headerWrap}>
        <View style={styles.coverWrap}>
          <CoverImage uri={coverUrl} />
        </View>
        <Text style={[styles.title, { color: t.text }]}>{meta.title}</Text>
        {meta.authorName ? (
          <Text style={[styles.author, { color: t.textMuted }]}>
            {meta.authorName}
          </Text>
        ) : null}
        {meta.narratorName ? (
          <Text style={[styles.author, { color: t.textMuted }]}>
            朗读者：{meta.narratorName}
          </Text>
        ) : null}
        {meta.publishedYear ? (
          <Text style={[styles.author, { color: t.textMuted }]}>
            出版年份：{meta.publishedYear}
          </Text>
        ) : null}
        {meta.publisher ? (
          <Text style={[styles.author, { color: t.textMuted }]}>
            出版社：{meta.publisher}
          </Text>
        ) : null}

        {progress && (
          <View style={styles.progressInfo}>
            <View style={[styles.progressTrack, { backgroundColor: t.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.max(0, Math.min(1, progress.progress)) * 100}%`,
                    backgroundColor: t.primary,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: t.textMuted }]}>
              已播放 {formatTime(progress.currentTime)} / {formatTime(progress.duration)}
            </Text>
          </View>
        )}

        <TouchableOpacity
      style={[styles.playBtn, { backgroundColor: t.primary }]}
      onPress={() => onPlay()}
    >
          <Icon name="playFilled" size={20} color="#fff" />
          <Text style={styles.playBtnText}>{progress ? '继续播放' : '开始播放'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={t.primary} /></View>
      ) : null}

      {meta.description ? (
        <Section title="简介">
          <Text style={[styles.desc, { color: t.text }]}>{meta.description}</Text>
        </Section>
      ) : null}

      {chapters.length > 0 && (
        <Section title={`目录 (${chapters.length})`}>
          <View>{chapters.map(renderChapter)}</View>
        </Section>
      )}

      {hasEbook && (
        <Section title="电子书">
          <TouchableOpacity style={[styles.actionRow, { borderColor: t.border }]} onPress={openEbook}>
            <Icon name="fileBook" size={20} color={t.text} />
            <Text style={[styles.actionText, { color: t.text }]}>打开电子书（占位）</Text>
            <Icon name="chevronRight" size={18} color={t.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionRow, { borderColor: t.border }]} onPress={openWebReader}>
            <Icon name="playCircle" size={20} color={t.text} />
            <Text style={[styles.actionText, { color: t.text }]}>在浏览器中打开</Text>
            <Icon name="chevronRight" size={18} color={t.textMuted} />
          </TouchableOpacity>
        </Section>
      )}

      {meta.genres && meta.genres.length > 0 && (
        <Section title="分类">
          <View style={styles.tagsRow}>
            {meta.genres.map((g) => (
              <View key={g} style={[styles.tag, { borderColor: t.border }]}>
                <Text style={[styles.tagText, { color: t.text }]}>{g}</Text>
              </View>
            ))}
          </View>
        </Section>
      )}
    </ScrollView>
  )
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: { label: string; onPress: () => void }
  children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: t.text }]}>{title}</Text>
        {action ? (
          <TouchableOpacity onPress={action.onPress}>
            <Text style={[styles.sectionAction, { color: t.primary }]}>{action.label}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View>{children}</View>
    </View>
  )
}

function CoverImage({ uri }: { uri: string }) {
  const { Image } = require('react-native')
  return <Image source={{ uri }} style={styles.cover} resizeMode="cover" />
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

const styles = {
  scroll: { paddingBottom: 32 },
  headerWrap: {
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  coverWrap: {
    width: 180,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden' as const,
    backgroundColor: '#888',
    marginBottom: 12,
  },
  cover: { width: '100%' as const, height: '100%' as const },
  title: { fontSize: 20, fontWeight: '700' as const, textAlign: 'center' as const },
  author: { fontSize: 14, marginTop: 4 },
  progressInfo: { width: '100%' as const, marginTop: 12 },
  progressTrack: { height: 4, borderRadius: 2 },
  progressFill: { height: '100%' as const, borderRadius: 2 },
  progressText: { fontSize: 12, marginTop: 4, textAlign: 'center' as const },
  playBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 16,
    gap: 8,
  },
  playBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' as const },
  center: { alignItems: 'center' as const, paddingVertical: 24 },
  section: { paddingHorizontal: 16, paddingTop: 12 },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600' as const },
  sectionAction: { fontSize: 13 },
  desc: { fontSize: 14, lineHeight: 22 },
  chapterRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  chapterIndex: { width: 28, fontSize: 13, textAlign: 'center' as const },
  chapterTitle: { fontSize: 14 },
  chapterTime: { fontSize: 12, marginTop: 2 },
  more: { fontSize: 12, paddingVertical: 8 },
  actionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  actionText: { flex: 1, fontSize: 14 },
  tagsRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  tagText: { fontSize: 12 },
}