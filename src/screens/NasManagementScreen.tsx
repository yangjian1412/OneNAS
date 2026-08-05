import { useAppStore } from '@/stores/appStore'
import DockerScreen from '@/screens/DockerScreen'
import PortainerScreen from '@/screens/PortainerScreen'

export default function NasManagementScreen() {
  const backend = useAppStore((s) => s.nasManagementBackend)
  if (backend === 'portainer') return <PortainerScreen />
  return <DockerScreen />
}