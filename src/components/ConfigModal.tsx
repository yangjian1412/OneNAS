import { useState, useEffect } from 'react'
import { View, Text, Modal, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { ServerConfig, ServiceConfig, ServiceType } from '@/types'
import { SERVICE_TYPE_LABELS } from '@/lib/constants'
import { useTheme } from '@/lib/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { login } from '@/lib/api/filebrowser'
import { fetchContainers } from '@/lib/api/unraid'
import { navidromeLogin } from '@/lib/api/navidrome'
import { useAppStore } from '@/stores/appStore'

function parseServerUrl(url: string): { protocol: 'http' | 'https'; host: string; port: number } {
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`)
    const protocol = (u.protocol === 'http:' ? 'http' : 'https') as 'http' | 'https'
    const host = u.hostname || url
    const port = u.port ? parseInt(u.port) : (protocol === 'https' ? 443 : 80)
    return { protocol, host, port }
  } catch {
    return { protocol: 'https', host: url, port: 443 }
  }
}

function composeServerUrl(s: { protocol: string; host: string; port: number }): string {
  const proto = s.protocol === 'http' ? 'http' : 'https'
  const defaultPort = proto === 'https' ? 443 : 80
  const port = s.port && s.port !== defaultPort ? `:${s.port}` : ''
  return `${proto}://${s.host}${port}`
}

interface Props {
  visible: boolean
  onClose: () => void
  type: ServiceType
  server: ServerConfig | null
  service: ServiceConfig | null
  onSaveServer: (s: ServerConfig) => void
  onSaveService: (s: ServiceConfig) => void
  onDelete: () => void
}

export default function ConfigModal({
  visible, onClose, type, server, service,
  onSaveServer, onSaveService, onDelete,
}: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const services = useAppStore((s) => s.services)
  const isServerType = type === 'filebrowser' || type === 'unraid'
  const isAppType = type === 'jellyfin' || type === 'navidrome' || type === 'audiobookshelf' || type === 'immich' || type === 'talebook' || type === 'aria2' || type === 'qbittorrent' || type === 'openlist' || type === 'emby'
  const [testing, setTesting] = useState(false)

  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('443')
  const [protocol, setProtocol] = useState<'http' | 'https'>('https')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [url, setUrl] = useState('')
  const [authType, setAuthType] = useState<'none' | 'basic' | 'token' | 'apikey'>('none')
  const [talebookLoginMode, setTalebookLoginMode] = useState<'code' | 'password' | 'guest'>('password')

  useEffect(() => {
    if (isServerType && server) {
      setName(server.name)
      if (type === 'filebrowser') {
        setUrl(composeServerUrl(server))
      } else {
        setHost(server.host)
        setPort(String(server.port))
      }
      setProtocol(server.protocol)
      setUsername(server.username ?? '')
      setPassword(server.password ?? '')
      setApiKey(server.apiKey ?? '')
    } else if (!isServerType && service) {
      setName(service.name)
      setUrl(service.url)
      setAuthType(service.authType)
      setUsername(service.username ?? '')
      setPassword(service.password ?? '')
      setApiKey(service.apiKey ?? '')
      if (type === 'talebook') {
        // 登录方式：code 写到 apiKey 字段、password 写到 username/password、guest 用空
        const mode = service.apiKey ? 'code' : (service.username ? 'password' : 'guest')
        setTalebookLoginMode(mode as 'code' | 'password' | 'guest')
      }
    } else {
      setName('')
      setHost('')
      setPort('443')
      setProtocol('https')
      setUsername('')
      setPassword('')
      setApiKey('')
      setUrl('')
      setAuthType('none')
      setTalebookLoginMode('password')
    }
  }, [visible, type, server, service])

  const handleClear = () => {
    setUsername('')
    setPassword('')
    setApiKey('')
    setUrl('')
    setAuthType('none')
    setName('')
    setHost('')
    setPort('443')
    setProtocol('https')
    if (!isServerType) {
      onSaveService({
        id: service?.id ?? '',
        name: service?.name ?? '',
        type,
        url: '',
        category: service?.category ?? 'tools',
        showInTopBar: service?.showInTopBar ?? false,
        tabAssignment: service?.tabAssignment ?? 'none',
        sortOrder: service?.sortOrder ?? 0,
        enabled: true,
        authType: 'none',
        username: undefined,
        password: undefined,
        apiKey: undefined,
      })
    }
    onClose()
  }

  const handleTestLocal = async () => {
    setTesting(true)
    try {
      if (type === 'filebrowser') {
        const parsed = parseServerUrl(url)
        const s: ServerConfig = {
          id: server?.id ?? '', name, type: 'filebrowser',
          host: parsed.host, port: parsed.port, protocol: parsed.protocol,
          username: username || undefined, password: password || undefined,
        }
        const result = await login(s)
        Alert.alert(result.ok ? 'Success' : 'Failed', result.ok ? 'Connected' : (result.error ?? 'Error'))
      } else if (type === 'unraid') {
        const s: ServerConfig = {
          id: server?.id ?? '', name, type: 'unraid',
          host, port: parseInt(port) || 443, protocol,
          apiKey: apiKey || undefined,
        }
        const result = await fetchContainers(s)
        Alert.alert(result.ok ? 'Success' : 'Failed', result.ok ? 'Connected' : (result.error ?? 'Error'))
      } else if (type === 'navidrome') {
        const result = await navidromeLogin(url, username, password)
        Alert.alert(result.ok ? 'Success' : 'Failed', result.ok ? `已连接到 ${result.server?.url ?? 'Navidrome'}` : (result.error ?? 'Error'))
      } else {
        Alert.alert('Info', 'Test not available for this service type')
      }
    } finally {
      setTesting(false)
    }
  }

  const handleSave = () => {
    if (isServerType) {
      if (type === 'filebrowser') {
        const parsed = parseServerUrl(url)
        onSaveServer({
          id: server?.id ?? '',
          name,
          type: 'filebrowser',
          host: parsed.host,
          port: parsed.port,
          protocol: parsed.protocol,
          username: username || undefined,
          password: password || undefined,
        })
        return
      }
      onSaveServer({
        id: server?.id ?? '',
        name,
        type: type as 'unraid' | 'filebrowser',
        host,
        port: parseInt(port) || 0,
        protocol,
        username: username || undefined,
        password: password || undefined,
        apiKey: apiKey || undefined,
      })
    } else {
      const normalizedType = (() => {
        const t = String(type ?? '').toLowerCase()
        if (t === 'audiobookshelf' || t.includes('audiobook')) return 'audiobookshelf' as ServiceType
        return type
      })()
      // talebook: code 写入 apiKey 字段方便统一持久化
      const isTalebook = normalizedType === 'talebook'
      const saveUsername = isTalebook ? (talebookLoginMode === 'password' ? (username || undefined) : undefined) : (username || undefined)
      const savePassword = isTalebook ? (talebookLoginMode === 'password' ? (password || undefined) : undefined) : (password || undefined)
      const saveApiKey = isTalebook ? (talebookLoginMode === 'code' ? (apiKey || undefined) : undefined) : (apiKey || undefined)
      onSaveService({
        id: service?.id ?? '',
        name,
        type: normalizedType,
        url,
        category: service?.category ?? 'tools',
        showInTopBar: service?.showInTopBar ?? false,
        tabAssignment: service?.tabAssignment ?? 'none',
        sortOrder: service?.sortOrder ?? 0,
        enabled: true,
        authType: isTalebook ? 'basic' : authType,
        username: saveUsername,
        password: savePassword,
        apiKey: saveApiKey,
      })
    }
  }

  const label = SERVICE_TYPE_LABELS[type] ?? type

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
          <View style={[styles.sheet, { backgroundColor: t.bg, paddingBottom: insets.bottom }]}>
            <View style={[styles.handleRow, { borderBottomColor: t.border }]}>
              <TouchableOpacity onPress={onClose}>
                <Text style={[styles.cancelBtn, { color: t.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <View style={styles.titleRow}>
                <Text style={[styles.title, { color: t.text }]}>{label}</Text>
              </View>
              <TouchableOpacity onPress={handleSave}>
                <Text style={[styles.saveBtn, { color: t.primary }]}>Save</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.form} contentContainerStyle={{ paddingBottom: 32 }}>
              <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Name</Text>
              <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
              placeholder="Display name" placeholderTextColor={t.textMuted}
              value={name} onChangeText={setName} />

            {isServerType ? (
              type === 'filebrowser' ? (
                <>
                  <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Server URL</Text>
                  <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                    placeholder="http://..." placeholderTextColor={t.textMuted}
                    value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} />

                  <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Username</Text>
                  <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                    placeholder="Username" placeholderTextColor={t.textMuted}
                    value={username} onChangeText={setUsername} />

                  <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Password</Text>
                  <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                    placeholder="Password" secureTextEntry placeholderTextColor={t.textMuted}
                    value={password} onChangeText={setPassword} />
                </>
              ) : (
              <>
                <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Host</Text>
                <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                  placeholder="IP or domain" placeholderTextColor={t.textMuted}
                  value={host} onChangeText={setHost} />

                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Port</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="443" keyboardType="number-pad" placeholderTextColor={t.textMuted}
                      value={port} onChangeText={setPort} />
                  </View>
                  <View style={{ marginLeft: 8 }}>
                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Protocol</Text>
                    <TouchableOpacity style={[styles.protocolBtn, { borderColor: t.border }]}
                      onPress={() => setProtocol(protocol === 'https' ? 'http' : 'https')}>
                      <Text style={[styles.protocolText, { color: t.text }]}>{protocol}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {type === 'filebrowser' ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Username</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="Username" placeholderTextColor={t.textMuted}
                      value={username} onChangeText={setUsername} />

                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Password</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="Password" secureTextEntry placeholderTextColor={t.textMuted}
                      value={password} onChangeText={setPassword} />
                  </>
                ) : (
                  <>
                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>API Key</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="API Key" secureTextEntry placeholderTextColor={t.textMuted}
                      value={apiKey} onChangeText={setApiKey} />
                  </>
                )}
              </>
              )
            ) : isAppType ? (
              <>
                {type === 'talebook' ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Server URL</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="https://你的 Talebook 地址"
                      placeholderTextColor={t.textMuted}
                      value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} />

                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>登录方式</Text>
                    <View style={styles.authRow}>
                      {(['code', 'password', 'guest'] as const).map((m) => {
                        const labels = { code: '访问码', password: '账号密码', guest: '游客' }
                        return (
                          <TouchableOpacity
                            key={m}
                            style={[styles.authBtn, { borderColor: t.border },
                              talebookLoginMode === m && { backgroundColor: t.primary, borderColor: t.primary }]}
                            onPress={() => setTalebookLoginMode(m)}
                          >
                            <Text style={[styles.authBtnText, { color: t.textSecondary },
                              talebookLoginMode === m && { color: '#fff' }]}>{labels[m]}</Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>

                    {talebookLoginMode === 'code' ? (
                      <>
                        <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>访问码</Text>
                        <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                          placeholder="服务端设置的访问码"
                          placeholderTextColor={t.textMuted}
                          value={apiKey} onChangeText={setApiKey}
                          autoCapitalize="none" autoCorrect={false} />
                      </>
                    ) : talebookLoginMode === 'password' ? (
                      <>
                        <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>用户名</Text>
                        <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                          placeholder="Username" placeholderTextColor={t.textMuted}
                          value={username} onChangeText={setUsername}
                          autoCapitalize="none" autoCorrect={false} />
                        <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>密码</Text>
                        <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                          placeholder="Password" secureTextEntry
                          placeholderTextColor={t.textMuted}
                          value={password} onChangeText={setPassword}
                          autoCapitalize="none" autoCorrect={false} />
                      </>
                    ) : (
                      <Text style={[styles.fieldLabel, { color: t.textMuted, marginTop: 8 }]}>
                        游客模式无需账号密码，仅可浏览公开内容
                      </Text>
                    )}
                    <Text style={[styles.fieldLabel, { color: t.textMuted, marginTop: 12 }]}>
                      提示：保存后到 Talebook 首页抽屉里点「登录」完成登录会话。
                    </Text>
                  </>
                ) : (type === 'jellyfin' || type === 'navidrome' || type === 'audiobookshelf' || type === 'emby') ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Server URL</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="http://..." placeholderTextColor={t.textMuted}
                      value={url} onChangeText={setUrl} />

                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Username</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="Username" placeholderTextColor={t.textMuted}
                      value={username} onChangeText={setUsername} />

                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Password</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="Password" secureTextEntry placeholderTextColor={t.textMuted}
                      value={password} onChangeText={setPassword} />
                  </>
                ) : type === 'aria2' ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Server URL</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="http://host:6800/jsonrpc" placeholderTextColor={t.textMuted}
                      value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} />

                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>RPC Secret（可选）</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="aria2.conf 的 rpc-secret" secureTextEntry placeholderTextColor={t.textMuted}
                      value={apiKey} onChangeText={setApiKey} />
                  </>
                ) : type === 'qbittorrent' ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Server URL</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="http://host:8080" placeholderTextColor={t.textMuted}
                      value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} />

                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Username</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="Username" placeholderTextColor={t.textMuted}
                      value={username} onChangeText={setUsername} />

                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Password</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="Password" secureTextEntry placeholderTextColor={t.textMuted}
                      value={password} onChangeText={setPassword} />
                  </>
                ) : type === 'openlist' ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Server URL</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="http://host:5244" placeholderTextColor={t.textMuted}
                      value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} />

                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>用户名（可选）</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="登录用户名" placeholderTextColor={t.textMuted}
                      value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />

                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>密码（可选）</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="登录密码" secureTextEntry placeholderTextColor={t.textMuted}
                      value={password} onChangeText={setPassword} />

                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Admin Token（可选）</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="管理后台生成的 JWT token" secureTextEntry placeholderTextColor={t.textMuted}
                      value={apiKey} onChangeText={setApiKey} />
                  </>
                ) : (
                  <>
                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>URL (optional, for browser fallback)</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="https://..." placeholderTextColor={t.textMuted}
                      value={url} onChangeText={setUrl} />
                  </>
                )}
              </>
            ) : (
              <>
                <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>URL</Text>
                <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                  placeholder="https://..." placeholderTextColor={t.textMuted}
                  value={url} onChangeText={setUrl} />

                <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Auth</Text>
                <View style={styles.authRow}>
                  {(['none', 'basic', 'token', 'apikey'] as const).map((a) => (
                    <TouchableOpacity key={a} style={[styles.authBtn, { borderColor: t.border },
                      authType === a && { backgroundColor: t.primary, borderColor: t.primary }]}
                      onPress={() => setAuthType(a)}>
                      <Text style={[styles.authBtnText, { color: t.textSecondary },
                        authType === a && { color: '#fff' }]}>{a === 'none' ? 'No Auth' : a}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {authType === 'basic' && (
                  <>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="Username" placeholderTextColor={t.textMuted}
                      value={username} onChangeText={setUsername} />
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="Password" secureTextEntry placeholderTextColor={t.textMuted}
                      value={password} onChangeText={setPassword} />
                  </>
                )}
                {authType === 'token' && (
                  <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                    placeholder="Token" placeholderTextColor={t.textMuted}
                    value={password} onChangeText={setPassword} />
                )}
                {authType === 'apikey' && (
                  <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                    placeholder="API Key" placeholderTextColor={t.textMuted}
                    value={apiKey} onChangeText={setApiKey} />
                )}

              </>
            )}

            <View style={styles.actions}>
              {isServerType && <TouchableOpacity style={[styles.testBtn, { borderColor: t.primary }]}
                onPress={handleTestLocal} disabled={testing}>
                {testing ? <ActivityIndicator size="small" color={t.primary} /> : <Text style={[styles.testBtnText, { color: t.primary }]}>Test Connection</Text>}
              </TouchableOpacity>}

              {(server || service) && (
                <TouchableOpacity onPress={isServerType ? onDelete : handleClear}>
                  <Text style={[styles.deleteBtn, { color: t.danger }]}>Remove Config</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </TouchableOpacity>
    </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '90%', minHeight: '50%',
  },
  handleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  titleIcon: { fontSize: 20, marginRight: 8 },
  title: { fontSize: 17, fontWeight: '700' },
  cancelBtn: { fontSize: 15 },
  saveBtn: { fontSize: 15, fontWeight: '600' },
  form: { paddingHorizontal: 16, paddingTop: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  protocolBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, marginTop: 20 },
  protocolText: { fontSize: 14, fontWeight: '600' },
  authRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  authBtn: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  authBtnText: { fontSize: 12, fontWeight: '500' },
  sectionLabel: { fontSize: 15, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  assignRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  assignBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 9 },
  assignBtnText: { fontSize: 13, fontWeight: '500' },
  actions: { marginTop: 24, gap: 12, paddingBottom: 16 },
  testBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  testBtnText: { fontSize: 14, fontWeight: '600' },
  deleteBtn: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
})
