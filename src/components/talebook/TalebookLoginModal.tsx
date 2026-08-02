import { useEffect, useState } from 'react'
import { View, Text, Modal, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/lib/theme'
import type { TalebookLoginMode } from '@/types'

interface Props {
  visible: boolean
  initialMode: TalebookLoginMode
  initialUsername: string
  initialCode: string
  isLoading: boolean
  onClose: () => void
  onSubmit: (mode: TalebookLoginMode, fields: { code?: string; username?: string; password?: string }) => void
}

export default function TalebookLoginModal({ visible, initialMode, initialUsername, initialCode, isLoading, onClose, onSubmit }: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const [mode, setMode] = useState<TalebookLoginMode>(initialMode || 'password')
  const [code, setCode] = useState(initialCode)
  const [username, setUsername] = useState(initialUsername)
  const [password, setPassword] = useState('')

  // 模态打开时重置
  useEffect(() => {
    if (visible) {
      setMode(initialMode || 'password')
      setUsername(initialUsername)
      setCode(initialCode)
      setPassword('')
    }
  }, [visible, initialMode, initialUsername, initialCode])

  const submit = () => {
    if (mode === 'code') onSubmit('code', { code })
    else if (mode === 'password') onSubmit('password', { username, password })
    else onSubmit('guest', {})
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
          <View style={[styles.sheet, { backgroundColor: t.bg, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose}>
                <Text style={[styles.cancel, { color: t.textMuted }]}>取消</Text>
              </TouchableOpacity>
              <Text style={[styles.title, { color: t.text }]}>登录 Talebook</Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
              <View style={[styles.tabs, { borderColor: t.border }]}>
                {(['code', 'password', 'guest'] as const).map((m) => {
                  const active = mode === m
                  const labels: Record<typeof m, string> = { code: '访问码', password: '账号密码', guest: '游客' }
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[styles.tab, active && { backgroundColor: t.primary }]}
                      onPress={() => setMode(m)}
                    >
                      <Text style={[styles.tabText, { color: active ? '#fff' : t.text }]}>{labels[m]}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {mode === 'code' ? (
                <View>
                  <Text style={[styles.label, { color: t.textSecondary }]}>访问码</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                    placeholder="请输入服务端设置的访问码"
                    placeholderTextColor={t.textMuted}
                    value={code}
                    onChangeText={setCode}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={[styles.hint, { color: t.textMuted }]}>适合通过管理员发放的访问码浏览。</Text>
                </View>
              ) : mode === 'password' ? (
                <View>
                  <Text style={[styles.label, { color: t.textSecondary }]}>用户名</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                    placeholder="用户名"
                    placeholderTextColor={t.textMuted}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={[styles.label, { color: t.textSecondary }]}>密码</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                    placeholder="密码"
                    placeholderTextColor={t.textMuted}
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              ) : (
                <View>
                  <Text style={[styles.hint, { color: t.textMuted, textAlign: 'center', marginVertical: 16 }]}>
                    游客模式：无需账号密码，仅可浏览公开内容。{"\n"}最近浏览 / 我的书架 不可用。
                  </Text>
                </View>
              )}

              <TouchableOpacity style={[styles.submit, { backgroundColor: t.primary }]} onPress={submit} disabled={isLoading}>
                {isLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitText}>登录</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  cancel: { fontSize: 15, width: 40 },
  title: { fontSize: 16, fontWeight: '700' },
  tabs: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '600' },
  label: { fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  hint: { fontSize: 12, marginTop: 8, lineHeight: 18 },
  submit: { marginTop: 24, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
