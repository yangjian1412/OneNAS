import { useState, useEffect } from 'react'
import { View, Text, Modal, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, StyleSheet, KeyboardAvoidingView, Platform, Image } from 'react-native'
import { ServerConfig, ServiceConfig, ServiceType } from '@/types'
import { SERVICE_TYPE_LABELS } from '@/lib/constants'
import { useTheme } from '@/lib/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { login } from '@/lib/api/filebrowser'
import { fetchContainers } from '@/lib/api/unraid'
import { navidromeLogin } from '@/lib/api/navidrome'
import { komgaLogin } from '@/lib/api/komga'
import { useAppStore } from '@/stores/appStore'
import { useTalebookStore } from '@/stores/talebookStore'

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
  onSaveService: (s: ServiceConfig, keepOpen?: boolean) => void
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
  const isAppType = type === 'jellyfin' || type === 'navidrome' || type === 'audiobookshelf' || type === 'immich' || type === 'talebook' || type === 'aria2' || type === 'qbittorrent' || type === 'openlist' || type === 'emby' || type === 'komga'
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
  const [talebookLoginMode, setTalebookLoginMode] = useState<'password' | 'guest'>('password')
  const [talebookServerType, setTalebookServerType] = useState<'talebook' | 'mybooks'>('talebook')
  const [talebookPrivateMode, setTalebookPrivateMode] = useState(false)
  const [talebookSiteAccessCode, setTalebookSiteAccessCode] = useState('')
  const [talebookCaptchaCode, setTalebookCaptchaCode] = useState('')
  const [talebookLoginError, setTalebookLoginError] = useState<string | null>(null)
  const [talebookServerSaved, setTalebookServerSaved] = useState(false)

  // Talebook store access (登录 + 验证码探测)
  const talebookLogin = useTalebookStore((s) => s.login)
  const talebookUnlockSite = useTalebookStore((s) => s.unlockSite)
  const talebookFetchCaptchaConfig = useTalebookStore((s) => s.fetchCaptchaConfig)
  const talebookFetchCaptchaImage = useTalebookStore((s) => s.fetchCaptchaImage)
  const talebookRefreshCaptcha = useTalebookStore((s) => s.refreshCaptcha)
  const talebookSetCaptchaCode = useTalebookStore((s) => s.setCaptchaCode)
  const talebookDismissGeetestHint = useTalebookStore((s) => s.dismissGeetestHint)
  const talebookIsLoading = useTalebookStore((s) => s.isLoading)
  const talebookCaptchaType = useTalebookStore((s) => s.captchaType)
  const talebookCaptchaImageBase64 = useTalebookStore((s) => s.captchaImageBase64)
  const talebookShowGeetestHint = useTalebookStore((s) => s.showGeetestHint)
  const talebookUserInfo = useTalebookStore((s) => s.userInfo)
  const talebookServer = useTalebookStore((s) => s.server)

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
        const mode = service.username ? 'password' : 'guest'
        setTalebookLoginMode(mode as 'password' | 'guest')
        // 私有模式相关字段
        const svcAny = service as any
        setTalebookServerType(svcAny.serverType === 'mybooks' ? 'mybooks' : 'talebook')
        setTalebookPrivateMode(!!svcAny.isPrivateMode)
        setTalebookSiteAccessCode(svcAny.siteAccessCode ?? '')
        setTalebookCaptchaCode('')
        setTalebookLoginError(null)
        setTalebookServerSaved(!!service)
        // 同步 talebookStore.server（不自动登录），使登录/解锁按钮可用
        if (service.id) {
          void useTalebookStore.getState().initServerFromService(service)
        } else {
          // 新服务：尚未生成 id，talebookStore 暂不同步，等待用户点击「保存服务器设置」
          void useTalebookStore.getState().fetchCaptchaConfig()
        }
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
    setTalebookLoginMode('password')
    setTalebookServerType('talebook')
    setTalebookPrivateMode(false)
    setTalebookSiteAccessCode('')
    setTalebookCaptchaCode('')
    setTalebookLoginError(null)
    setTalebookServerSaved(false)
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
      } else if (type === 'komga') {
        const result = await komgaLogin({ id: '', name: '', url: url.trim().replace(/\/+$/, ''), username, password })
        Alert.alert(result.ok ? 'Success' : 'Failed', result.ok ? `已连接到 Komga (${result.userName ?? ''})` : (result.error ?? 'Error'))
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
      // openlist 只支持账号密码登录，不保存 token
      const saveApiKey = (isTalebook || normalizedType === 'openlist') ? undefined : (apiKey || undefined)
      onSaveService({
        id: service?.id ?? '',
        name: name || SERVICE_TYPE_LABELS[type],
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
        // Talebook 私有模式 + 服务类型字段（存储在 service 对象的扩展字段中）
        isPrivateMode: isTalebook ? talebookPrivateMode : undefined,
        siteAccessCode: isTalebook ? (talebookPrivateMode ? talebookSiteAccessCode : undefined) : undefined,
        serverType: isTalebook ? talebookServerType : undefined,
      }, isTalebook ? true : false)
      if (isTalebook) {
        setTalebookServerSaved(true)
        // 构建 savedSvc（含可能的现有 id）并同步到 talebookStore.server，使登录按钮可用
        const savedSvc: ServiceConfig = {
          ...service,
          id: service?.id || `talebook-${Date.now()}`,
          type: normalizedType as ServiceType,
          url,
          username: saveUsername,
          password: savePassword,
          apiKey: saveApiKey,
          isPrivateMode: talebookPrivateMode,
          siteAccessCode: talebookPrivateMode ? talebookSiteAccessCode : undefined,
          serverType: talebookServerType,
        } as any
        void useTalebookStore.getState().initServerFromService(savedSvc)
      }
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
              {type === 'talebook' ? (
                <TouchableOpacity onPress={onClose}>
                  <Text style={[styles.saveBtn, { color: t.primary }]}>关闭</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={handleSave}>
                  <Text style={[styles.saveBtn, { color: t.primary }]}>Save</Text>
                </TouchableOpacity>
              )}
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
                    {/* ===== 服务器设置 ===== */}
                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Server URL</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="https://你的 Talebook 地址"
                      placeholderTextColor={t.textMuted}
                      value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} />

                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>服务类型</Text>
                    <View style={styles.authRow}>
                      <TouchableOpacity
                        style={[styles.authBtn, { borderColor: t.border },
                          talebookServerType === 'talebook' && { backgroundColor: t.primary, borderColor: t.primary }]}
                        onPress={() => setTalebookServerType('talebook')}
                      >
                        <Text style={[styles.authBtnText, { color: t.textSecondary },
                          talebookServerType === 'talebook' && { color: '#fff' }]}>Talebook</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.authBtn, { borderColor: t.border },
                          talebookServerType === 'mybooks' && { backgroundColor: t.primary, borderColor: t.primary }]}
                        onPress={() => setTalebookServerType('mybooks')}
                      >
                        <Text style={[styles.authBtnText, { color: t.textSecondary },
                          talebookServerType === 'mybooks' && { color: '#fff' }]}>MyBooks</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>私有模式</Text>
                    <View style={styles.authRow}>
                      <TouchableOpacity
                        style={[styles.authBtn, { borderColor: t.border },
                          talebookPrivateMode && { backgroundColor: t.primary, borderColor: t.primary }]}
                        onPress={() => setTalebookPrivateMode(true)}
                      >
                        <Text style={[styles.authBtnText, { color: t.textSecondary },
                          talebookPrivateMode && { color: '#fff' }]}>启用</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.authBtn, { borderColor: t.border },
                          !talebookPrivateMode && { backgroundColor: t.primary, borderColor: t.primary }]}
                        onPress={() => setTalebookPrivateMode(false)}
                      >
                        <Text style={[styles.authBtnText, { color: t.textSecondary },
                          !talebookPrivateMode && { color: '#fff' }]}>关闭</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={[styles.primaryBtn, { backgroundColor: t.primary, marginTop: 8 }]}
                      onPress={handleSave}
                    >
                      <Text style={styles.primaryBtnText}>保存服务器设置</Text>
                    </TouchableOpacity>

                    {talebookServerSaved && (
                      <Text style={[styles.savedHint, { color: t.primary }]}>
                        {talebookPrivateMode ? '已保存，请完成站点解锁与登录' : '已保存，请登录'}
                      </Text>
                    )}

                    {/* ===== 解锁站点（私有模式，前置条件） ===== */}
                    {talebookPrivateMode && talebookServerSaved && (
                      <View style={[styles.section, { borderColor: t.border }]}>
                        <Text style={[styles.sectionTitle, { color: t.text }]}>① 解锁站点</Text>
                        <Text style={[styles.hint, { color: t.textMuted, marginTop: 4 }]}>
                          请输入服务端「管理 → 系统设置 → 邀请/访问码」配置的访问码
                        </Text>
                        <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text, marginTop: 12 }]}
                          placeholder="站点访问码"
                          placeholderTextColor={t.textMuted}
                          value={talebookSiteAccessCode} onChangeText={setTalebookSiteAccessCode}
                          autoCapitalize="none" autoCorrect={false} />

                        {talebookCaptchaType === 'image' && talebookCaptchaImageBase64 ? (
                          <View style={{ marginTop: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={[styles.fieldLabel, { color: t.textSecondary, marginTop: 0 }]}>人机验证</Text>
                              <TouchableOpacity onPress={talebookRefreshCaptcha}>
                                <Text style={{ color: t.primary, fontSize: 12 }}>刷新</Text>
                              </TouchableOpacity>
                            </View>
                            <Image source={{ uri: `data:image/png;base64,${talebookCaptchaImageBase64}` }} style={styles.captchaImage} />
                            <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text, marginTop: 4 }]}
                              placeholder="请输入验证码"
                              placeholderTextColor={t.textMuted}
                              value={talebookCaptchaCode} onChangeText={(v) => { setTalebookCaptchaCode(v); talebookSetCaptchaCode(v) }}
                              autoCapitalize="none" autoCorrect={false} />
                          </View>
                        ) : null}

                        <TouchableOpacity
                          style={[styles.primaryBtn, { backgroundColor: t.primary, marginTop: 12 }]}
                          onPress={async () => {
                            setTalebookLoginError(null)
                            const result = await talebookUnlockSite({ accessCode: talebookSiteAccessCode })
                            if (result.ok) {
                              // 重新探测登录场景的验证码配置
                              void useTalebookStore.getState().fetchCaptchaConfig()
                            } else {
                              setTalebookLoginError(result.error ?? '解锁失败')
                            }
                          }}
                          disabled={talebookIsLoading}
                        >
                          {talebookIsLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryBtnText}>解锁</Text>}
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* ===== 登录（密码或游客） ===== */}
                    {talebookServerSaved && (
                      <View style={[styles.section, { borderColor: t.border }]}>
                        <Text style={[styles.sectionTitle, { color: t.text }]}>{talebookPrivateMode ? '② 登录' : '登录'}</Text>

                        {talebookUserInfo?.isLogin ? (
                          <Text style={[styles.hint, { color: t.primary, marginTop: 4 }]}>
                            ✓ 已登录：{talebookUserInfo.nickname || talebookUserInfo.username || '已登录'}
                          </Text>
                        ) : (
                          <Text style={[styles.hint, { color: t.textMuted, marginTop: 4 }]}>
                            当前未登录
                          </Text>
                        )}

                        {/* Tab 切换：账号密码 / 游客 */}
                        <View style={[styles.authRow, { marginTop: 12 }]}>
                          {(['password', 'guest'] as const).map((m) => {
                            const labels = { password: '账号密码', guest: '游客' }
                            return (
                              <TouchableOpacity
                                key={m}
                                style={[styles.authBtn, { borderColor: t.border },
                                  talebookLoginMode === m && { backgroundColor: t.primary, borderColor: t.primary }]}
                                onPress={() => { setTalebookLoginMode(m); setTalebookLoginError(null) }}
                              >
                                <Text style={[styles.authBtnText, { color: t.textSecondary },
                                  talebookLoginMode === m && { color: '#fff' }]}>{labels[m]}</Text>
                              </TouchableOpacity>
                            )
                          })}
                        </View>

                        {talebookLoginMode === 'password' && (
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
                        )}

                        {talebookLoginMode === 'guest' && (
                          <Text style={[styles.hint, { color: t.textMuted, marginTop: 12 }]}>
                            游客模式：无需账号密码，仅可浏览公开内容。最近浏览 / 我的书架 不可用。
                          </Text>
                        )}

                        {/* 人机验证码（login 场景） */}
                        {talebookCaptchaType === 'image' && talebookCaptchaImageBase64 ? (
                          <View style={{ marginTop: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={[styles.fieldLabel, { color: t.textSecondary, marginTop: 0 }]}>人机验证</Text>
                              <TouchableOpacity onPress={talebookRefreshCaptcha}>
                                <Text style={{ color: t.primary, fontSize: 12 }}>刷新</Text>
                              </TouchableOpacity>
                            </View>
                            <Image source={{ uri: `data:image/png;base64,${talebookCaptchaImageBase64}` }} style={styles.captchaImage} />
                            <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text, marginTop: 4 }]}
                              placeholder="请输入验证码"
                              placeholderTextColor={t.textMuted}
                              value={talebookCaptchaCode} onChangeText={(v) => { setTalebookCaptchaCode(v); talebookSetCaptchaCode(v) }}
                              autoCapitalize="none" autoCorrect={false} />
                          </View>
                        ) : talebookCaptchaType === 'geetest' && talebookShowGeetestHint ? (
                          <View style={[styles.hintBox, { backgroundColor: (t.warning || '#f0a020') + '15', borderColor: (t.warning || '#f0a020') + '30' }]}>
                            <Text style={[styles.hint, { color: t.warning || '#a06000' }]}>
                              服务端启用了极验验证，需先在 Web 端登录后再回到 App。
                            </Text>
                            <TouchableOpacity onPress={talebookDismissGeetestHint} style={{ marginTop: 4 }}>
                              <Text style={{ color: t.primary, fontSize: 12 }}>知道了</Text>
                            </TouchableOpacity>
                          </View>
                        ) : null}

                        {talebookLoginError && (
                          <Text style={[styles.hint, { color: t.error || '#e53935', marginTop: 8 }]}>
                            {talebookLoginError}
                          </Text>
                        )}

                        <TouchableOpacity
                          style={[styles.primaryBtn, { backgroundColor: t.primary, marginTop: 16 }]}
                          onPress={async () => {
                            setTalebookLoginError(null)
                            const result = await talebookLogin(talebookLoginMode, {
                              username: talebookLoginMode === 'password' ? username : undefined,
                              password: talebookLoginMode === 'password' ? password : undefined,
                              captchaCode: talebookCaptchaCode || undefined,
                            })
                            if (!result.ok) {
                              setTalebookLoginError(result.error ?? '登录失败')
                            } else {
                              // 登录成功后保存（包含账号密码）
                              handleSave()
                            }
                          }}
                          disabled={talebookIsLoading}
                        >
                          {talebookIsLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryBtnText}>登录</Text>}
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                ) : (type === 'jellyfin' || type === 'navidrome' || type === 'audiobookshelf' || type === 'emby' || type === 'komga') ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Server URL</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder={type === 'komga' ? 'http://host:25600' : 'http://...'} placeholderTextColor={t.textMuted}
                      value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} />

                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Username</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="Username" placeholderTextColor={t.textMuted}
                      value={username} onChangeText={setUsername} autoCapitalize="none" />

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

                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>密码</Text>
                    <TextInput style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]}
                      placeholder="登录密码" secureTextEntry placeholderTextColor={t.textMuted}
                      value={password} onChangeText={setPassword} />
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

  // Talebook 配置 + 登录一体化样式
  primaryBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  savedHint: { fontSize: 12, marginTop: 6 },
  section: { marginTop: 20, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 18 },
  hintBox: { borderWidth: 1, borderRadius: 8, padding: 10 },
  captchaImage: { width: '100%', height: 60, resizeMode: 'contain', marginTop: 4, borderRadius: 6 },
})
