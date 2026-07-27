import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Container } from '@/types'
import { useTheme } from '@/lib/theme'

interface Props {
  container: Container
  onStart?: (id: string) => void
  onStop?: (id: string) => void
  onRestart?: (id: string) => void
  onDetail?: (id: string) => void
  loading?: boolean
}

const STATE_COLORS: Record<string, string> = {
  RUNNING: '#4caf50',
  EXITED: '#f44336',
  PAUSED: '#ff9800',
}

export default function ContainerCard({ container, onStart, onStop, onRestart, onDetail, loading }: Props) {
  const t = useTheme()
  const color = STATE_COLORS[container.state] ?? '#999'
  const name = container.names?.[0] ?? container.id

  return (
    <View style={[styles.card, { backgroundColor: t.bg, borderColor: t.border }]}>
      <View style={styles.top}>
        <View style={styles.nameRow}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={[styles.name, { color: t.text }]}>{name}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: color + '22' }]}>
          <Text style={[styles.badgeText, { color }]}>{container.state}</Text>
        </View>
      </View>
      <Text style={[styles.image, { color: t.textSecondary }]} numberOfLines={1}>{container.image}</Text>
      {container.ports ? <Text style={[styles.ports, { color: t.textMuted }]}>Ports: {container.ports}</Text> : null}
      <View style={styles.actions}>
        {container.state === 'RUNNING' ? (
          <>
            <TouchableOpacity style={[styles.btn, { borderColor: t.danger }]} onPress={() => onStop?.(container.id)} disabled={loading}>
              <Text style={[styles.btnText, { color: t.danger }]}>Stop</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { borderColor: t.warning }]} onPress={() => onRestart?.(container.id)} disabled={loading}>
              <Text style={[styles.btnText, { color: t.warning }]}>Restart</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[styles.btn, { borderColor: t.success }]} onPress={() => onStart?.(container.id)} disabled={loading}>
            <Text style={[styles.btnText, { color: t.success }]}>Start</Text>
          </TouchableOpacity>
        )}
        {onDetail ? (
          <TouchableOpacity style={[styles.btn, { borderColor: t.textMuted }]} onPress={() => onDetail(container.id)} disabled={loading}>
            <Text style={[styles.btnText, { color: t.textMuted }]}>详情</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: 8, padding: 12, marginVertical: 4, borderWidth: StyleSheet.hairlineWidth },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  name: { fontSize: 14, fontWeight: '600' },
  badge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  image: { fontSize: 12, marginTop: 4, marginLeft: 18, fontFamily: 'monospace' },
  ports: { fontSize: 11, marginTop: 2, marginLeft: 18 },
  actions: { flexDirection: 'row', marginTop: 8, gap: 6, marginLeft: 18 },
  btn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  btnText: { fontSize: 11, fontWeight: '600' },
})