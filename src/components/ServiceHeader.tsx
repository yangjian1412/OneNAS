import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native'
import Icon from '@/components/Icon'

interface BaseProps {
  t: any
  onMenuPress: () => void
  title?: string
  subtitle?: string
}

interface DownloadProps extends BaseProps {
  mode: 'download'
  autoRefresh: boolean
  setAutoRefresh: (v: boolean) => void
  onRefresh: () => void
}

interface FileBrowserProps extends BaseProps {
  mode: 'filebrowser'
  onRefresh: () => void
}

interface PlainProps extends BaseProps {
  mode: 'plain'
  onRefresh?: () => void
}

type Props = DownloadProps | FileBrowserProps | PlainProps

const SIDE_MIN_WIDTH = 0

export default function ServiceHeader(props: Props) {
  const { t, onMenuPress, title, subtitle } = props

  return (
    <View style={[styles.header, { backgroundColor: t.card, borderBottomColor: t.border }]}>
      <View style={styles.side}>
        <TouchableOpacity onPress={onMenuPress} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="menu" size={24} color={t.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.center}>
        {title ? (
          <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{title}</Text>
        ) : null}
        {subtitle ? (
          <Text style={[styles.subtitle, { color: t.textMuted }]} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>

      <View style={styles.side}>
        <View style={styles.rightCluster}>
          {props.mode === 'download' ? (
            <>
              <Text style={[styles.autoLabel, { color: t.textMuted }]}>自动</Text>
              <Switch
                value={props.autoRefresh}
                onValueChange={props.setAutoRefresh}
                trackColor={{ false: t.border, true: t.primary + '88' }}
                thumbColor={props.autoRefresh ? t.primary : '#f4f3f4'}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
              <TouchableOpacity onPress={props.onRefresh} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="refresh" size={22} color={t.primary} />
              </TouchableOpacity>
            </>
          ) : (
            props.onRefresh ? (
              <TouchableOpacity onPress={props.onRefresh} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="refresh" size={22} color={t.primary} />
              </TouchableOpacity>
            ) : null
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  side: { minWidth: SIDE_MIN_WIDTH, flexDirection: 'row', alignItems: 'center' },
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  iconBtn: { padding: 6, borderRadius: 8 },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 11, marginTop: 2 },
  rightCluster: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 0 },
  autoLabel: { fontSize: 11 },
})