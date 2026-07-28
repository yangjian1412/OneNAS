import { View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useAppStore, getTab2Service, getTab3Service } from '@/stores/appStore'
import { SERVICE_TYPE_ICONS } from '@/lib/constants'
import { useTheme } from '@/lib/theme'
import FileScreen from '@/screens/FileScreen'
import ServiceScreen from '@/screens/ServiceScreen'
import DockerScreen from '@/screens/DockerScreen'
import SettingsScreen from '@/screens/SettingsScreen'
import Icon from '@/components/Icon'

const Tab = createBottomTabNavigator()

export default function TabNavigator() {
  const services = useAppStore((s) => s.services)
  const hideNasManagement = useAppStore((s) => s.hideNasManagement)
  const hideTabLabels = useAppStore((s) => s.hideTabLabels)
  const tab2 = getTab2Service(services)
  const tab3 = getTab3Service(services)
  const t = useTheme()

  const iconFor = (routeName: string, focused: boolean) => {
    const color = focused ? t.primary : t.textMuted
    const icon = () => {
      if (routeName === 'Files') return <Icon name="folderEmpty" size={27} color={color} />
      if (routeName === 'Tab2') return tab2 ? <Icon name={SERVICE_TYPE_ICONS[tab2.type] ?? 'folderEmpty'} size={27} color={color} /> : null
      if (routeName === 'Tab3') return tab3 ? <Icon name={SERVICE_TYPE_ICONS[tab3.type] ?? 'folderEmpty'} size={27} color={color} /> : null
      if (routeName === 'NasManagement') return <Icon name="unraid" size={27} color={color} />
      if (routeName === 'Settings') return <Icon name="settings" size={27} color={color} />
      return null
    }
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', width: 32, height: 32 }}>
        {focused && <View style={{ width: 18, height: 3, borderRadius: 1.5, backgroundColor: t.primary, marginBottom: 4 }} />}
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
          tabBarShowLabel: !hideTabLabels,
          tabBarIcon: ({ focused }) => iconFor(route.name, focused),
          tabBarLabelStyle: { fontSize: 12, marginTop: 2 },
          tabBarActiveTintColor: t.primary,
          tabBarInactiveTintColor: t.textMuted,
          tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.border, height: 72, paddingBottom: 14, paddingTop: 6 },
        })}
      >
        <Tab.Screen name="Files" component={FileScreen} options={{ tabBarLabel: '文件' }} />
        {tab2 && (
          <Tab.Screen name="Tab2" options={{ tabBarLabel: tab2.name }}>
            {() => <ServiceScreen serviceId={tab2.id} />}
          </Tab.Screen>
        )}
        {tab3 && (
          <Tab.Screen name="Tab3" options={{ tabBarLabel: tab3.name }}>
            {() => <ServiceScreen serviceId={tab3.id} />}
          </Tab.Screen>
        )}
        {!hideNasManagement && (
          <Tab.Screen name="NasManagement" component={DockerScreen} options={{ tabBarLabel: 'NAS 系统管理' }} />
        )}
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: '设置' }} />
      </Tab.Navigator>
    </NavigationContainer>
  )
}
