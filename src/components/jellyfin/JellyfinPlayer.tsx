import { useState, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, Modal, StyleSheet, Dimensions, ActivityIndicator, Platform, StatusBar } from 'react-native'
import { VideoView, useVideoPlayer } from 'expo-video'
import type { JellyfinItem, JellyfinServerConfig } from '@/types'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'

interface Props {
  visible: boolean
  url: string
  item: JellyfinItem
  server: JellyfinServerConfig
  onClose: () => void
}

const { width: SCREEN_W } = Dimensions.get('window')

export default function JellyfinPlayer({ visible, url, item, server, onClose }: Props) {
  const t = useTheme()
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const player = useVideoPlayer({ uri: url }, (p) => {
    p.addListener('playing', () => setIsPlaying(true))
    p.addListener('paused', () => setIsPlaying(false))
    p.addListener('ended', () => { setIsPlaying(false) })
    p.addListener('readyForDisplay', () => setIsReady(true))
    p.addListener('error', (e: any) => {
      setError(e?.message || '播放出错')
    })
  })

  useEffect(() => {
    return () => {
      try { player.pause(); player.destroy() } catch {}
    }
  }, [])

  const togglePlay = () => {
    if (isPlaying) player.pause()
    else player.play()
  }

  const pt = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.container, { backgroundColor: '#000' }]}>
        <View style={[styles.header, { paddingTop: pt + 8 }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Icon name="chevronLeft" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{item.Name}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.playerWrap}>
          {error ? (
            <View style={styles.center}>
              <Icon name="alertCircle" size={48} color="#ff5252" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : (
            <>
              {!isReady && (
                <ActivityIndicator size="large" color="#fff" style={styles.loader} />
              )}
              <VideoView
                style={[styles.video, !isReady && styles.hidden]}
                player={player}
                allowsFullscreen
                allowsPictureInPicture
                nativeControls={false}
              />
            </>
          )}
        </View>

        <View style={styles.controls}>
          <TouchableOpacity style={styles.playBtn} onPress={togglePlay} disabled={!!error}>
            <Icon name={isPlaying ? 'pause' : 'playCircle'} size={44} color="#fff" />
          </TouchableOpacity>
          <View style={styles.info}>
            <Text style={styles.itemName} numberOfLines={1}>{item.Name}</Text>
            {item.SeriesName && (
              <Text style={styles.seriesName} numberOfLines={1}>{item.SeriesName}</Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#ff5252', fontSize: 14, marginTop: 12, textAlign: 'center', paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 },
  closeBtn: { padding: 8 },
  title: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  playerWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loader: { position: 'absolute' },
  video: { width: SCREEN_W, height: SCREEN_W * (9 / 16) },
  hidden: { opacity: 0 },
  controls: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 32,
  },
  playBtn: { padding: 8, marginRight: 8 },
  info: { flex: 1 },
  itemName: { color: '#fff', fontSize: 15, fontWeight: '500' },
  seriesName: { color: '#aaa', fontSize: 13, marginTop: 2 },
})
