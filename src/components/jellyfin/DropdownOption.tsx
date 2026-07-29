import { useState, useRef, useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal } from 'react-native'
import { useTheme } from '@/lib/theme'
import Icon from '@/components/Icon'

interface Option {
  label: string
  value: number | string
}

interface Props {
  label: string
  options: Option[]
  selected: number | string
  onSelect: (v: any) => void
}

export default function DropdownOption({ label, options, selected, onSelect }: Props) {
  const t = useTheme()
  const [open, setOpen] = useState(false)
  const selectedLabel = options.find((o) => o.value === selected)?.label ?? String(selected)

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={[styles.trigger, { backgroundColor: t.card, borderColor: t.border }]}
        activeOpacity={0.7}
        onPress={() => setOpen(!open)}
      >
        <Text style={[styles.triggerLabel, { color: t.text }]}>{label}</Text>
        <View style={styles.triggerRight}>
          <Text style={[styles.triggerValue, { color: t.primary }]}>{selectedLabel}</Text>
          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} color={t.textMuted} />
        </View>
      </TouchableOpacity>
      {open && (
        <View style={[styles.dropdown, { backgroundColor: t.card, borderColor: t.border }]}>
          <ScrollView bounces={false} style={styles.scroll}>
            {options.map((opt) => {
              const isSelected = selected === opt.value
              return (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[styles.option, { backgroundColor: isSelected ? t.primary + '18' : 'transparent' }]}
                  activeOpacity={0.7}
                  onPress={() => { onSelect(opt.value); setOpen(false) }}
                >
                  <Text style={[styles.optionText, { color: isSelected ? t.primary : t.text }]}>
                    {opt.label}
                  </Text>
                  {isSelected && <Icon name="check" size={16} color={t.primary} />}
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 8, zIndex: 1 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  triggerLabel: { fontSize: 14, flex: 1 },
  triggerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  triggerValue: { fontSize: 14, fontWeight: '600' },
  dropdown: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  scroll: { maxHeight: 200 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  optionText: { fontSize: 14, flex: 1 },
})
