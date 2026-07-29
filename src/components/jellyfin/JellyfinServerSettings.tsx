import { useState, useEffect, useCallback } from 'react'
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet, Platform, StatusBar, Linking, Alert } from 'react-native'
import { useTheme } from '@/lib/theme'
import { useJellyfinStore } from '@/stores/jellyfinStore'
import {
  jellyfinGetSystemInfo,
  jellyfinGetSessions,
  jellyfinRefreshLibrary,
  jellyfinRestartServer,
} from '@/lib/api/jellyfin'
import type { JellyfinSession, JellyfinSystemInfo } from '@/types'
import Icon from '@/components/Icon'

interface Props {
  visible: boolean
  onClose: () => void
}

function formatUptime(startTime: string): string {
  const ms = Date.now() - new Date(startTime).getTime()
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  if (d > 0) return `${d} 天 ${h} 小时`
  return `${h} 小时`
}

export default function JellyfinServerSettings({ visible, onClose }: Props) {
  const t = useTheme()
  const server = useJellyfinStore((s) => s.server)
  const pt = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0

  const [info, setInfo] = useState<JellyfinSystemInfo | null>(null)
  const [sessions, setSessions] = useState<JellyfinSession[]>([])
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [showSessions, setShowSessions] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [restarting, setRestarting] = useState(false)

  const loadData = useCallback(async () => {
    if (!server) return
    setLoadingInfo(true)
    const [infoRes, sessionsRes] = await Promise.all([
      jellyfinGetSystemInfo(server),
      jellyfinGetSessions(server),
    ])
    if (infoRes.ok && infoRes.info) setInfo(infoRes.info)
    if (sessionsRes.ok) setSessions(sessionsRes.sessions ?? [])
    setLoadingInfo(false)
  }, [server])

  useEffect(() => {
    if (visible) loadData()
  }, [visible, loadData])

  const handleRefresh = async () => {
    if (!server) return
    setRefreshing(true)
    const r = await jellyfinRefreshLibrary(server)
    if (r.ok) {
      Alert.alert('', '已触发媒体库刷新')
    } else {
      Alert.alert('失败', r.error ?? '刷新请求失败')
    }
    setRefreshing(false)
  }

  const handleRestart = async () => {
    if (!server) return
    Alert.alert('确认重启', '确定要重启 Jellyfin 服务器吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '重启',
        style: 'destructive',
        onPress: async () => {
          setRestarting(true)
          const r = await jellyfinRestartServer(server)
          if (!r.ok) {
            Alert.alert('失败', r.error ?? '重启请求失败')
          }
          setRestarting(false)
        },
      },
    ])
  }

  const handleOpenBrowser = () => {
    if (!server?.url) return
    Linking.openURL(server.url)
  }

  if (!server?.url) return null

  const playingSessions = sessions.filter((s) => s.NowPlayingItem)

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        <View style={[styles.toolbar, { backgroundColor: t.card, paddingTop: pt + 8 }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="x" size={24} color={t.text} />
          </TouchableOpacity>
          <Text style={[styles.toolbarTitle, { color: t.text }]}>服务器</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Server Info */}
          <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
            <View style={styles.infoRow}>
              <Text style={[styles.label, { color: t.textMuted }]}>服务器名称</Text>
              <Text style={[styles.value, { color: t.text }]}>{info?.ServerName || '...'}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: t.border }]} />
            <View style={styles.infoRow}>
              <Text style={[styles.label, { color: t.textMuted }]}>版本</Text>
              <Text style={[styles.value, { color: t.text }]}>{info?.Version || '...'}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: t.border }]} />
            <View style={styles.infoRow}>
              <Text style={[styles.label, { color: t.textMuted }]}>运行时间</Text>
              <Text style={[styles.value, { color: t.text }]}>
                {info ? formatUptime(info.StartTime) : '...'}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: t.border }]} />
            <View style={styles.infoRow}>
              <Text style={[styles.label, { color: t.textMuted }]}>系统</Text>
              <Text style={[styles.value, { color: t.text }]}>{info?.OperatingSystemDisplayName || '...'}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: t.border }]} />
            <View style={styles.infoRow}>
              <Text style={[styles.label, { color: t.textMuted }]}>活跃会话</Text>
              <TouchableOpacity onPress={() => setShowSessions(!showSessions)}>
                <Text style={[styles.value, { color: t.primary }]}>{sessions.length} 个</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Active Sessions */}
          {showSessions && sessions.length > 0 && (
            <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
              {sessions.map((s) => (
                <View key={s.Id} style={[styles.sessionRow, { borderBottomColor: t.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sessionDevice, { color: t.text }]}>{s.DeviceName}</Text>
                    <Text style={[styles.sessionMeta, { color: t.textMuted }]}>
                      {s.UserName} · {s.Client}
                    </Text>
                  </View>
                  {s.NowPlayingItem && (
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Icon name="play" size={14} color={t.primary} />
                      <Text style={[styles.nowPlaying, { color: t.primary }]} numberOfLines={1}>
                        {s.NowPlayingItem.Name}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Quick Actions */}
          <Text style={[styles.sectionTitle, { color: t.text }]}>快捷操作</Text>
          <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
            <TouchableOpacity style={styles.actionRow} onPress={handleRefresh} disabled={refreshing}>
              <Icon name="refresh" size={20} color={t.text} />
              <Text style={[styles.actionText, { color: t.text }]}>
                {refreshing ? '正在刷新...' : '刷新媒体库'}
              </Text>
              <Icon name="chevronRight" size={16} color={t.textMuted} />
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: t.border }]} />
            <TouchableOpacity style={styles.actionRow} onPress={handleRestart} disabled={restarting}>
              <Icon name="power" size={20} color={t.danger} />
              <Text style={[styles.actionText, { color: t.danger }]}>
                {restarting ? '正在重启...' : '重启服务器'}
              </Text>
              <Icon name="chevronRight" size={16} color={t.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Browser link */}
          <View style={[styles.browserCard, { borderColor: t.border }]}>
            <Text style={[styles.browserHint, { color: t.textMuted }]}>
              如需更详细的设置（用户管理、插件、转码等），请用浏览器打开 Jellyfin 管理后台
            </Text>
            <TouchableOpacity style={[styles.browserBtn, { backgroundColor: t.card, borderColor: t.primary }]} onPress={handleOpenBrowser}>
              <Icon name="compass" size={18} color={t.primary} />
              <Text style={[styles.browserBtnText, { color: t.primary }]}>在浏览器中打开</Text>
            </TouchableOpacity>
          </View>

          {loadingInfo && <Text style={[styles.loadingText, { color: t.textMuted }]}>加载中...</Text>}
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingBottom: 8,
  },
  closeBtn: { padding: 8 },
  toolbarTitle: { fontSize: 17, fontWeight: '700', marginLeft: 8, flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    borderRadius: 12, borderWidth: 1, overflow: 'hidden',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14,
  },
  label: { fontSize: 13 },
  value: { fontSize: 14, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  actionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14,
  },
  actionText: { flex: 1, fontSize: 14, fontWeight: '500', marginLeft: 12 },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sessionDevice: { fontSize: 13, fontWeight: '500' },
  sessionMeta: { fontSize: 11, marginTop: 2 },
  nowPlaying: { fontSize: 11, marginTop: 2 },
  browserCard: {
    borderRadius: 12, borderWidth: 1,
    padding: 16, alignItems: 'center',
  },
  browserHint: { fontSize: 13, lineHeight: 18, textAlign: 'center', marginBottom: 14 },
  browserBtn: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, borderWidth: 1,
    paddingVertical: 10, paddingHorizontal: 20,
  },
  browserBtnText: { fontSize: 14, fontWeight: '600', marginLeft: 8 },
  loadingText: { textAlign: 'center', fontSize: 13 },
})
