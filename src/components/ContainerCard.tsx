import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Container } from '@/types'
import { useTheme } from '@/lib/theme'

interface Props {
  container: Container
  onStart?: (id: string) => void
  onStop?: (id: string) => void
  onRestart?: (id: string) => void
  loading?: boolean
}

const STATE_COLORS: Record<string, string> = {
  RUNNING: '#4caf50',
  EXITED: '#f44336',
  PAUSED: '#ff9800',
}

export default function ContainerCard({ container, onStart, onStop, onRestart, loading }: Props) {
  const t = useTheme()
  const color = STATE_COLORS[container.state] ?? '#999'
  const name = container.names?.[0] ?? container.id

  return (
    <View style={[styles.card, { backgroundColor: t.card }]}>
      <View style={styles.top}>
        <View style={styles.nameRow}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={[styles.name, { color: t.text }]}>{name}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: color + '22' }]}>
          <Text style={[styles.badgeText, { color }]}>{container.state}</Text>
        </View>
      </View>
      <Text style={[styles.image, { color: t.textSecondary }]}>{container.image}</Text>
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
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: 10, padding: 14, marginHorizontal: 12, marginVertical: 5, elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 1 }, shadowRadius: 4 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  name: { fontSize: 15, fontWeight: '600' },
  badge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  image: { fontSize: 13, marginTop: 6, marginLeft: 18 },
  ports: { fontSize: 12, marginTop: 2, marginLeft: 18 },
  actions: { flexDirection: 'row', marginTop: 10, gap: 8, marginLeft: 18 },
  btn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  btnText: { fontSize: 12, fontWeight: '600' },
})