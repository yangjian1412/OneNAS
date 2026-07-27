import { useColorScheme } from 'react-native'
import { useAppStore } from '@/stores/appStore'
import { ThemeMode } from '@/types'

interface ThemeColors {
  bg: string
  card: string
  text: string
  textSecondary: string
  textMuted: string
  border: string
  primary: string
  danger: string
  success: string
  warning: string
  headerBg: string
  barBg: string
  inputBg: string
}

const light: ThemeColors = {
  bg: '#ffffff',
  card: '#f8f9fa',
  text: '#222222',
  textSecondary: '#555555',
  textMuted: '#999999',
  border: '#dddddd',
  primary: '#2196f3',
  danger: '#f44336',
  success: '#4caf50',
  warning: '#ff9800',
  headerBg: '#f8f9fa',
  barBg: '#f8f9fa',
  inputBg: '#ffffff',
}

const dark: ThemeColors = {
  bg: '#121212',
  card: '#1e1e1e',
  text: '#e0e0e0',
  textSecondary: '#aaaaaa',
  textMuted: '#666666',
  border: '#333333',
  primary: '#64b5f6',
  danger: '#ef5350',
  success: '#66bb6a',
  warning: '#ffa726',
  headerBg: '#1a1a1a',
  barBg: '#1a1a1a',
  inputBg: '#2a2a2a',
}

export function useTheme(): ThemeColors {
  const themeMode = useAppStore((s) => s.theme)
  const systemScheme = useColorScheme()
  let mode: 'light' | 'dark'
  if (themeMode === 'system') {
    mode = systemScheme === 'dark' ? 'dark' : 'light'
  } else {
    mode = themeMode
  }
  return mode === 'dark' ? dark : light
}