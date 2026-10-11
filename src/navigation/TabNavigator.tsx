import { StyleSheet, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppStore, getTab2Service, getTab3Service } from '@/stores/appStore'
import { SERVICE_TYPE_ICONS, SERVICE_TYPE_LABELS } from '@/lib/constants'
import { useTheme } from '@/lib/theme'
import { useLayout } from '@/lib/useLayout'
import FileScreen from '@/screens/FileScreen'
import ServiceScreen from '@/screens/ServiceScreen'
import NasManagementScreen from '@/screens/NasManagementScreen'
import SettingsScreen from '@/screens/SettingsScreen'
import Icon from '@/components/Icon'

const Tab = createBottomTabNavigator()

export default function TabNavigator() {
  const services = useAppStore((s) => s.services)
  const hideNasManagement = useAppStore((s) => s.hideNasManagement)
  const hideTabLabels = useAppStore((s) => s.hideTabLabels)
  const nasManagementBackend = useAppStore((s) => s.nasManagementBackend)
  const tab2 = getTab2Service(services)
  const tab3 = getTab3Service(services)
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const bottomInset = Math.max(insets.bottom, 0)
  // 平板/折叠屏展开/横屏（expanded）→ 常驻左侧导航栏 + 右侧内容（分栏）
  // 窄屏（手机竖屏等）→ 底部 tab bar。用 react-navigation 原生侧栏能力，无需自绘。
  const { isExpanded } = useLayout()

  const iconFor = (routeName: string, focused: boolean) => {
    const color = focused ? t.primary : t.textMuted
    const icon = () => {
      if (routeName === 'Files') return <Icon name="folderEmpty" size={27} color={color} />
      if (routeName === 'Tab2') return tab2 ? <Icon name={SERVICE_TYPE_ICONS[tab2.type] ?? 'folderEmpty'} size={27} color={color} /> : null
      if (routeName === 'Tab3') return tab3 ? <Icon name={SERVICE_TYPE_ICONS[tab3.type] ?? 'folderEmpty'} size={27} color={color} /> : null
      if (routeName === 'NasManagement') return <Icon name={nasManagementBackend === 'portainer' ? 'docker' : 'unraid'} size={27} color={color} />
      if (routeName === 'Settings') return <Icon name="settings" size={27} color={color} />
      return null
    }
    // 分栏（左侧栏）里选中态由 material 药丸背景表达，不需要底部 tab 那根指示条
    if (isExpanded) {
      return <View style={styles.railIcon}>{icon()}</View>
    }
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', width: 32, height: 34 }}>
        <View style={{ width: 18, height: 3, borderRadius: 1.5, backgroundColor: focused ? t.primary : 'transparent', marginBottom: 4 }} />
        {icon()}
      </View>
    )
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        backBehavior="none"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarPosition: isExpanded ? 'left' : 'bottom',
          tabBarVariant: isExpanded ? 'material' : 'uikit',
          // 分栏侧栏是常驻的，没有文字认不出当前位置，所以无视「隐藏标签」设置、
          // 强制显示文字；回到窄屏的底部 tab 时再按设置决定显不显示。
          tabBarShowLabel: isExpanded ? true : !hideTabLabels,
          tabBarLabelPosition: isExpanded ? 'beside-icon' : 'below-icon',
          tabBarIcon: ({ focused }) => iconFor(route.name, focused),
          tabBarLabelStyle: isExpanded
            ? { fontSize: 13, marginTop: 0, marginLeft: 12 }
            : { fontSize: 12, marginTop: 2 },
          tabBarActiveTintColor: t.primary,
          tabBarInactiveTintColor: t.textMuted,
          tabBarActiveBackgroundColor: isExpanded ? t.primary + '1A' : undefined,
          tabBarStyle: isExpanded
            ? {
                // 左侧栏：固定宽度 + 右侧分隔线，高度撑满；默认 sidebar 宽度 360 太宽
                backgroundColor: t.bg,
                width: 176,
                borderRightColor: t.border,
                paddingTop: 8,
              }
            : {
                backgroundColor: t.bg,
                borderTopColor: t.border,
                height: 72,
                paddingBottom: 14,
                paddingTop: 6,
              },
          tabBarBackground: () => (
            <View style={{ flex: 1, backgroundColor: t.bg }}>
              {!isExpanded && bottomInset > 0 && (
                <View style={{ position: 'absolute', left: 0, right: 0, bottom: -bottomInset, height: bottomInset, backgroundColor: t.bg }} />
              )}
            </View>
          ),
        })}
      >
        <Tab.Screen name="Files" component={FileScreen} options={{ tabBarLabel: '文件' }} />
        {tab2 && (
          <Tab.Screen name="Tab2" options={{ tabBarLabel: tab2.name || SERVICE_TYPE_LABELS[tab2.type] }}>
            {() => <ServiceScreen serviceId={tab2.id} />}
          </Tab.Screen>
        )}
        {tab3 && (
          <Tab.Screen name="Tab3" options={{ tabBarLabel: tab3.name || SERVICE_TYPE_LABELS[tab3.type] }}>
            {() => <ServiceScreen serviceId={tab3.id} />}
          </Tab.Screen>
        )}
        {!hideNasManagement && (
          <Tab.Screen name="NasManagement" component={NasManagementScreen} options={{ tabBarLabel: 'NAS 系统管理' }} />
        )}
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: '设置' }} />
      </Tab.Navigator>
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  railIcon: { alignItems: 'center', justifyContent: 'center', width: 24, height: 24 },
})
