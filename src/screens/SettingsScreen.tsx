import { useState, useRef, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, Alert, Modal, StyleSheet, Switch, Animated, BackHandler } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { NestableScrollContainer, NestableDraggableFlatList, RenderItemParams } from 'react-native-draggable-flatlist'
import { useAppStore } from '@/stores/appStore'
import { ServerConfig, ServiceConfig, ServiceType } from '@/types'
import { generateId } from '@/lib/crypto'
import { SERVICE_TYPE_LABELS, SERVICE_TYPE_ICONS } from '@/lib/constants'
import { useTheme } from '@/lib/theme'
import ConfigModal from '@/components/ConfigModal'
import Icon from '@/components/Icon'
import * as Clipboard from 'expo-clipboard'

const SERVICE_TYPES: ServiceType[] = ['jellyfin', 'navidrome', 'audiobookshelf', 'immich', 'aria2', 'qbittorrent', 'openlist', 'talebook']

interface ServiceRow {
  key: string
  type: ServiceType
  service: ServiceConfig | null
}

function serverByType(servers: ServerConfig[], type: string) {
  return servers.find((server) => server.type === type)
}

function serviceByType(services: ServiceConfig[], type: ServiceType) {
  return services.find((service) => service.type === type)
}

export default function SettingsScreen() {
  const servers = useAppStore((s) => s.servers)
  const services = useAppStore((s) => s.services)
  const themeMode = useAppStore((s) => s.theme)
  const hideNasManagement = useAppStore((s) => s.hideNasManagement)
  const hideTabLabels = useAppStore((s) => s.hideTabLabels)
  const setHideTabLabels = useAppStore((s) => s.setHideTabLabels)
  const addServer = useAppStore((s) => s.addServer)
  const updateServer = useAppStore((s) => s.updateServer)
  const deleteServer = useAppStore((s) => s.deleteServer)
  const addService = useAppStore((s) => s.addService)
  const updateService = useAppStore((s) => s.updateService)
  const deleteService = useAppStore((s) => s.deleteService)
  const setServices = useAppStore((s) => s.setServices)
  const setTheme = useAppStore((s) => s.setTheme)
  const setHideNasManagement = useAppStore((s) => s.setHideNasManagement)
  const importConfig = useAppStore((s) => s.importConfig)
  const exportConfig = useAppStore((s) => s.exportConfig)
  const t = useTheme()

  const [modalVisible, setModalVisible] = useState(false)
  const [modalType, setModalType] = useState<ServiceType>('immich')
  const [modalServer, setModalServer] = useState<ServerConfig | null>(null)
  const [modalService, setModalService] = useState<ServiceConfig | null>(null)
  const [tagPickerSlot, setTagPickerSlot] = useState<'tab2' | 'tab3' | null>(null)
  const [exportText, setExportText] = useState<string | null>(null)
  const [importText, setImportText] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [sortMode, setSortMode] = useState(false)
  const lastBackPressRef = useRef(0)
  const toastAnim = useRef(new Animated.Value(0)).current
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFocused = useIsFocused()
  const isFocusedRef = useRef(isFocused)
  isFocusedRef.current = isFocused

  const showToast = () => {
    Animated.timing(toastAnim, { toValue: 1, duration: 160, useNativeDriver: true }).start()
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start()
    }, 1500)
  }

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isFocusedRef.current) return false
      const now = Date.now()
      if (now - lastBackPressRef.current < 2000) {
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastAnim.setValue(0)
        return false
      }
      lastBackPressRef.current = now
      showToast()
      return true
    })
    return () => sub.remove()
  }, [])

  const rows: ServiceRow[] = SERVICE_TYPES
    .map((type) => ({
      key: type,
      type,
      service: serviceByType(services, type) ?? null,
    }))
    .sort((a, b) => (a.service?.sortOrder ?? 10000) - (b.service?.sortOrder ?? 10000))

  const fileServer = serverByType(servers, 'filebrowser')
  const unraidServer = serverByType(servers, 'unraid')

  const openServerModal = (type: 'filebrowser' | 'unraid') => {
    setModalType(type)
    setModalServer(serverByType(servers, type) ?? null)
    setModalService(null)
    setModalVisible(true)
  }

  const openServiceModal = (row: ServiceRow) => {
    setModalType(row.type)
    setModalServer(null)
    setModalService(row.service)
    setModalVisible(true)
  }

  const handleSaveServer = (server: ServerConfig) => {
    const existing = serverByType(servers, server.type)
    if (existing) updateServer(existing.id, server)
    else addServer({ ...server, id: generateId() })
    setModalVisible(false)
  }

  const handleSaveService = (service: ServiceConfig) => {
    const existing = service.id
      ? services.find((item) => item.id === service.id)
      : serviceByType(services, service.type)
    if (existing) updateService(existing.id, service)
    else addService({ ...service, id: generateId(), sortOrder: services.length })
    setModalVisible(false)
  }

  const handleDelete = () => {
    if (modalType === 'filebrowser' || modalType === 'unraid') {
      const server = serverByType(servers, modalType)
      if (server) deleteServer(server.id)
    } else if (modalService?.id) {
      deleteService(modalService.id)
    } else {
      const service = serviceByType(services, modalType)
      if (service) deleteService(service.id)
    }
    setModalVisible(false)
  }

  const ensureService = (row: ServiceRow) => {
    if (row.service) return row.service
    return ensureServiceByType(row.type)
  }

  const ensureServiceByType = (type: ServiceType): ServiceConfig => {
    const existing = serviceByType(services, type)
    if (existing) return existing
    const service: ServiceConfig = {
      id: generateId(), name: SERVICE_TYPE_LABELS[type], type,
      url: '', category: 'tools', showInTopBar: false, tabAssignment: 'none',
      sortOrder: services.length, enabled: true, authType: 'none',
    }
    addService(service)
    return service
  }

  const assignTagByType = (type: ServiceType, slot: 'tab2' | 'tab3') => {
    const service = ensureServiceByType(type)
    assignTag(service.id, slot)
  }

  const toggleTopBar = (row: ServiceRow) => {
    const service = ensureService(row)
    updateService(service.id, { showInTopBar: !service.showInTopBar })
  }

  const handleDragEnd = ({ data }: { data: ServiceRow[] }) => {
    const position = new Map(data.map((row, index) => [row.service?.id, index]))
    setServices(services.map((service) => ({
      ...service,
      sortOrder: position.get(service.id) ?? service.sortOrder,
    })))
  }

  const assignTag = (serviceId: string, slot: 'tab2' | 'tab3') => {
    services.forEach((service) => {
      if (service.tabAssignment === slot && service.id !== serviceId) {
        updateService(service.id, { tabAssignment: 'none' })
      }
    })
    updateService(serviceId, { tabAssignment: slot })
  }

  const clearTag = (slot: 'tab2' | 'tab3') => {
    const service = services.find((item) => item.tabAssignment === slot)
    if (service) updateService(service.id, { tabAssignment: 'none' })
  }

  const tagService = (slot: 'tab2' | 'tab3') => services.find((service) => service.tabAssignment === slot)

  const renderService = ({ item, drag, isActive }: RenderItemParams<ServiceRow>) => {
    const label = item.service?.name || SERVICE_TYPE_LABELS[item.type]
    const shown = item.service?.showInTopBar ?? false
    const isImmich = item.type === 'immich'
    return (
      <TouchableOpacity
        activeOpacity={sortMode ? 0.7 : 0.85}
        onLongPress={sortMode ? drag : undefined}
        disabled={!sortMode && false}
        style={[styles.serviceRow, { backgroundColor: t.card, borderColor: isActive ? t.primary : t.border }]}
      >
        <Icon name={SERVICE_TYPE_ICONS[item.type] ?? 'folderEmpty'} size={28} style={styles.serviceIcon} />
        <View style={styles.serviceInfo}>
          <Text style={[styles.serviceName, { color: t.text }]} numberOfLines={1}>{label}</Text>
          <Text style={[styles.serviceHint, { color: t.textMuted }]}>{shown ? '顶部栏已显示' : '顶部栏已隐藏'}</Text>
        </View>
        {isImmich ? (
          <View style={styles.configButtonPlaceholder} />
        ) : (
          <TouchableOpacity style={[styles.configButton, { borderColor: t.border }]} onPress={() => openServiceModal(item)}>
            <Text style={[styles.configText, { color: t.primary }]}>配置</Text>
          </TouchableOpacity>
        )}
        <Switch value={shown} onValueChange={() => toggleTopBar(item)} trackColor={{ false: t.border, true: t.primary }} thumbColor="#fff" />
      </TouchableOpacity>
    )
  }

  const header = (
    <View>
      <Text style={[styles.sectionLabel, { color: t.text }]}>服务设置</Text>
      <View style={styles.sectionGroup}>
        <View style={[styles.serverCard, { backgroundColor: t.card, borderColor: t.border }]}>
          <Icon name="filebrowser" size={32} style={styles.serviceIcon} />
          <View style={styles.serviceInfo}>
            <Text style={[styles.serviceName, { color: t.text }]}>文件管理</Text>
            <Text style={[styles.serviceHint, { color: fileServer ? t.success : t.textMuted }]} numberOfLines={1}>
              {fileServer ? '已配置' : '请配置 FileBrowser 服务'}
            </Text>
          </View>
          <TouchableOpacity style={[styles.configButton, { borderColor: t.border }]} onPress={() => openServerModal('filebrowser')}>
            <Text style={[styles.configText, { color: t.primary }]}>配置</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.serverCard, { backgroundColor: t.card, borderColor: t.border }]}>
          <Icon name="unraid" size={32} style={styles.serviceIcon} />
          <View style={styles.serviceInfo}>
            <Text style={[styles.serviceName, { color: t.text }]}>NAS 管理</Text>
            <Text style={[styles.serviceHint, { color: unraidServer ? t.success : t.textMuted }]} numberOfLines={1}>
              {unraidServer ? '已配置' : '请配置 Unraid API Key'}
            </Text>
          </View>
          <TouchableOpacity style={[styles.configButton, { borderColor: t.border }]} onPress={() => openServerModal('unraid')}>
            <Text style={[styles.configText, { color: t.primary }]}>配置</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sortHeaderRow}>
        <Text style={[styles.hint, { color: t.textMuted }]}>{sortMode ? '拖动调整顺序' : '点击右侧开关以调整顺序'}</Text>
        <View style={styles.sortModeRow}>
          <Text style={[styles.sortModeLabel, { color: t.textMuted }]}>排序</Text>
          <Switch value={sortMode} onValueChange={setSortMode} trackColor={{ false: t.border, true: t.primary }} thumbColor="#fff" />
        </View>
      </View>
      <View style={styles.sectionGroup}>
        {sortMode ? (
          <NestableDraggableFlatList
            data={rows}
            keyExtractor={(item) => item.key}
            renderItem={renderService}
            onDragEnd={handleDragEnd}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          />
        ) : (
          rows.map((item) => (
            <View key={item.key} style={[styles.serviceRow, { backgroundColor: t.card, borderColor: t.border, marginBottom: 8 }]}>
              <Icon name={SERVICE_TYPE_ICONS[item.type] ?? 'folderEmpty'} size={28} style={styles.serviceIcon} />
              <View style={styles.serviceInfo}>
                <Text style={[styles.serviceName, { color: t.text }]} numberOfLines={1}>{item.service?.name || SERVICE_TYPE_LABELS[item.type]}</Text>
                <Text style={[styles.serviceHint, { color: t.textMuted }]}>{(item.service?.showInTopBar ?? false) ? '顶部栏已显示' : '顶部栏已隐藏'}</Text>
              </View>
              {item.type === 'immich' ? (
                <View style={styles.configButtonPlaceholder} />
              ) : (
                <TouchableOpacity style={[styles.configButton, { borderColor: t.border }]} onPress={() => openServiceModal(item)}>
                  <Text style={[styles.configText, { color: t.primary }]}>配置</Text>
                </TouchableOpacity>
              )}
              <Switch value={item.service?.showInTopBar ?? false} onValueChange={() => toggleTopBar(item)} trackColor={{ false: t.border, true: t.primary }} thumbColor="#fff" />
            </View>
          ))
        )}
      </View>

      <Text style={[styles.sectionLabel, { color: t.text }]}>标签设置</Text>
      <View style={[styles.card, { backgroundColor: t.card }]}>
        {(['tab2', 'tab3'] as const).map((slot, index) => {
          const current = tagService(slot)
          return (
            <View key={slot} style={[styles.tagRow, index === 1 && { borderTopWidth: 0 }]}>
              <Text style={[styles.tagLabel, { color: t.text }]}>标签{index + 2}</Text>
              <TouchableOpacity style={[styles.tagSelect, { borderColor: t.border }]} onPress={() => setTagPickerSlot(slot)}>
                {current ? <Icon name={SERVICE_TYPE_ICONS[current.type] ?? 'folderEmpty'} size={20} style={{ marginRight: 8 }} /> : null}
                <Text style={[styles.tagSelectText, { color: current ? t.text : t.textMuted }]} numberOfLines={1}>{current?.name || (current ? SERVICE_TYPE_LABELS[current.type] : '添加标签')}</Text>
                <Text style={[styles.chevron, { color: t.textMuted }]}>⌄</Text>
              </TouchableOpacity>
            </View>
          )
        })}
        <View style={[styles.toggleRow, { borderTopColor: t.border }]}>
          <View style={styles.serviceInfo}>
            <Text style={[styles.serviceName, { color: t.text }]}>隐藏文字</Text>
            <Text style={[styles.serviceHint, { color: t.textMuted }]}>只显示标签图标，不显示文字</Text>
          </View>
          <Switch value={hideTabLabels} onValueChange={setHideTabLabels} trackColor={{ false: t.border, true: t.primary }} thumbColor="#fff" />
        </View>
        <View style={[styles.toggleRow, { borderTopColor: t.border }]}>
          <View style={styles.serviceInfo}>
            <Text style={[styles.serviceName, { color: t.text }]}>NAS 系统管理</Text>
            <Text style={[styles.serviceHint, { color: t.textMuted }]}>Docker、系统信息与容器操作</Text>
          </View>
          <Switch value={!hideNasManagement} onValueChange={(visible) => setHideNasManagement(!visible)} trackColor={{ false: t.border, true: t.primary }} thumbColor="#fff" />
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: t.text }]}>主题</Text>
      <View style={[styles.card, { backgroundColor: t.card }]}>
        <View style={styles.themeRow}>
          {(['light', 'dark', 'system'] as const).map((mode) => (
            <TouchableOpacity key={mode} style={[styles.themeButton, { borderColor: t.border, backgroundColor: themeMode === mode ? t.primary : 'transparent' }]} onPress={() => setTheme(mode)}>
              <Text style={[styles.themeButtonText, { color: themeMode === mode ? '#fff' : t.text }]}>{mode === 'light' ? '浅色' : mode === 'dark' ? '深色' : '跟随系统'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: t.text }]}>导入/导出</Text>
      <View style={[styles.card, { backgroundColor: t.card }]}>
        <View style={styles.importExportRow}>
          <TouchableOpacity style={[styles.ioButton, { backgroundColor: t.primary }]} onPress={async () => { setExportText(await exportConfig()) }}>
            <Text style={styles.ioButtonText}>导出</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.ioButton, { backgroundColor: t.primary }]} onPress={() => { setImportText(''); setImportOpen(true) }}>
            <Text style={styles.ioButtonText}>导入</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={!!tagPickerSlot} transparent animationType="fade" onRequestClose={() => setTagPickerSlot(null)}>
        <View style={styles.pickerOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setTagPickerSlot(null)} activeOpacity={1} />
          <View style={[styles.picker, { backgroundColor: t.card }]}>
            <Text style={[styles.pickerTitle, { color: t.text }]}>添加标签</Text>
            <TouchableOpacity style={[styles.pickerItem, { borderBottomColor: t.border }]} onPress={() => { if (tagPickerSlot) clearTag(tagPickerSlot); setTagPickerSlot(null) }}>
              <Text style={[styles.pickerItemText, { color: t.textMuted }]}>无</Text>
            </TouchableOpacity>
            {SERVICE_TYPES.filter((type) => type !== 'immich').map((type) => {
              const existing = serviceByType(services, type)
              const display = existing?.name || SERVICE_TYPE_LABELS[type]
              return (
                <TouchableOpacity key={type} style={[styles.pickerItem, { borderBottomColor: t.border }]} onPress={() => { if (tagPickerSlot) assignTagByType(type, tagPickerSlot); setTagPickerSlot(null) }}>
                  <Icon name={SERVICE_TYPE_ICONS[type] ?? 'folderEmpty'} size={24} style={styles.serviceIcon} />
                  <Text style={[styles.pickerItemText, { color: t.text }]}>{display}</Text>
                </TouchableOpacity>
              )
            })}
            <TouchableOpacity style={styles.pickerCancel} onPress={() => setTagPickerSlot(null)}><Text style={[styles.clearText, { color: t.primary }]}>取消</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={exportText !== null} transparent animationType="slide" onRequestClose={() => setExportText(null)}>
        <View style={styles.pickerOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setExportText(null)} activeOpacity={1} />
          <View style={[styles.sheet, { backgroundColor: t.card }]}>
            <Text style={[styles.pickerTitle, { color: t.text }]}>已导出配置</Text>
            <TextInput multiline editable={false} style={[styles.exportBox, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text }]} value={exportText ?? ''} />
            <View style={styles.sheetActions}>
              <TouchableOpacity onPress={async () => { if (exportText) { await Clipboard.setStringAsync(exportText); Alert.alert('已复制', '配置已复制到剪贴板') } }}>
                <Text style={[styles.clearText, { color: t.primary }]}>一键复制</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setExportText(null)}><Text style={[styles.clearText, { color: t.textMuted }]}>关闭</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={importOpen} transparent animationType="slide" onRequestClose={() => setImportOpen(false)}>
        <View style={styles.pickerOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setImportOpen(false)} activeOpacity={1} />
          <View style={[styles.sheet, { backgroundColor: t.card }]}>
            <Text style={[styles.pickerTitle, { color: t.text }]}>导入配置</Text>
            <TextInput multiline autoFocus style={[styles.exportBox, { backgroundColor: t.inputBg, borderColor: t.border, color: t.text, minHeight: 180 }]} placeholder="粘贴 JSON 配置" placeholderTextColor={t.textMuted} value={importText} onChangeText={setImportText} />
            <View style={styles.sheetActions}>
              <TouchableOpacity onPress={() => setImportOpen(false)}><Text style={[styles.clearText, { color: t.textMuted }]}>取消</Text></TouchableOpacity>
              <TouchableOpacity onPress={async () => {
                try { await importConfig(importText); setImportOpen(false); Alert.alert('完成', '配置已导入') }
                catch (error: any) { Alert.alert('错误', error.message ?? 'JSON 解析失败') }
              }}><Text style={[styles.clearText, { color: t.primary }]}>确定导入</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <Text style={[styles.screenTitle, { color: t.text }]}>设置</Text>
      <NestableScrollContainer
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        {header}
      </NestableScrollContainer>
      <ConfigModal visible={modalVisible} onClose={() => setModalVisible(false)} type={modalType} server={modalServer} service={modalService} onSaveServer={handleSaveServer} onSaveService={handleSaveService} onDelete={handleDelete} />
      <Animated.View pointerEvents="none" style={[styles.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}>
        <View style={[styles.toastInner, { backgroundColor: '#000' }]}>
          <Text style={styles.toastText}>再按一次退出</Text>
        </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toast: { position: 'absolute', left: 0, right: 0, bottom: 120, alignItems: 'center' },
  toastInner: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24 },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  list: { paddingTop: 12, paddingBottom: 48 },
  screenTitle: { fontSize: 26, fontWeight: '800', paddingHorizontal: 16, marginBottom: 14 },
  sectionLabel: { fontSize: 16, fontWeight: '700', paddingHorizontal: 16, marginTop: 24, marginBottom: 10 },
  sectionGroup: { paddingHorizontal: 16, marginBottom: 4 },
  hint: { fontSize: 12, flex: 1, marginRight: 8 },
  sortHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  sortModeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sortModeLabel: { fontSize: 12, fontWeight: '600' },
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 14 },
  serverCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 64, marginBottom: 8 },
  serviceRow: { borderWidth: 1, borderRadius: 12, minHeight: 64, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  serviceIcon: { width: 38, alignItems: 'center', justifyContent: 'center' },
  serviceInfo: { flex: 1, marginHorizontal: 8 },
  serviceName: { fontSize: 15, fontWeight: '700' },
  serviceHint: { fontSize: 12, marginTop: 4 },
  configButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, minWidth: 52, minHeight: 32, justifyContent: 'center', alignItems: 'center' },
  configButtonPlaceholder: { marginRight: 6, minWidth: 52, minHeight: 32 },
  configText: { fontSize: 13, fontWeight: '600' },
  themeRow: { flexDirection: 'row', gap: 10 },
  themeButton: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  themeButtonText: { fontSize: 14, fontWeight: '600' },
  tagRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 12 },
  tagLabel: { width: 64, fontWeight: '700', fontSize: 14 },
  tagSelect: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  tagSelectText: { flex: 1, fontSize: 14, fontWeight: '600' },
  chevron: { fontSize: 16, marginLeft: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 8 },
  importExportRow: { flexDirection: 'row', gap: 12 },
  ioButton: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  ioButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalBackdrop: { ...StyleSheet.absoluteFill },
  picker: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28 },
  pickerTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerItemText: { fontSize: 15, marginLeft: 12, fontWeight: '600' },
  emptyPicker: { paddingVertical: 16, fontSize: 13 },
  pickerCancel: { alignItems: 'center', paddingTop: 14 },
  clearText: { fontSize: 14, fontWeight: '600' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 32 },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, paddingTop: 16 },
  exportBox: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 12, minHeight: 220, textAlignVertical: 'top', fontFamily: 'monospace' },
})