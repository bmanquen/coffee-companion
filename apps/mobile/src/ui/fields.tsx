import { useMemo, useState } from 'react'
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

const SEARCH_PLACEHOLDER = 'Search...'
const NO_RESULTS = 'No results found.'

export function fieldSlug(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function fieldTestId(label: string) {
  return `field-${fieldSlug(label)}`
}

export function selectTriggerTestId(label: string) {
  return `select-trigger-${fieldSlug(label)}`
}

export function selectSheetTestId(label: string) {
  return `select-sheet-${fieldSlug(label)}`
}

export function selectSearchTestId(label: string) {
  return `select-search-${fieldSlug(label)}`
}

export function selectOptionTestId(id: string) {
  return `select-option-${fieldSlug(id)}`
}

export function selectTriggerA11yLabel(
  label: string,
  selectedOrPlaceholder: string,
) {
  return `${label}, ${selectedOrPlaceholder}`
}

function optionText(option: { name: string; label?: string }) {
  return option.label ?? option.name
}

export function Field({
  label,
  value,
  onChange,
  error,
  keyboardType = 'default',
  multiline = false,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad'
  multiline?: boolean
  disabled?: boolean
}) {
  return (
    <View style={styles.field}>
      <Text>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityState={disabled ? { disabled: true } : undefined}
        testID={fieldTestId(label)}
        value={value}
        editable={!disabled}
        onChangeText={disabled ? undefined : onChange}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[styles.input, multiline ? styles.multiline : null]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

export function SelectField({
  label,
  value,
  options,
  placeholder,
  onChange,
  error,
  disabled = false,
}: {
  label: string
  value: string
  options: Array<{ id: string; name: string; label?: string }>
  placeholder: string
  onChange: (id: string) => void
  error?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = options.find((option) => option.id === value)
  const selectedText = selected ? optionText(selected) : placeholder
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter((option) =>
      optionText(option).toLowerCase().includes(needle),
    )
  }, [options, query])

  const close = () => {
    setQuery('')
    setOpen(false)
  }

  return (
    <View style={styles.field}>
      <Text>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={selectTriggerA11yLabel(label, selectedText)}
        accessibilityState={disabled ? { disabled: true } : undefined}
        testID={selectTriggerTestId(label)}
        disabled={disabled}
        onPress={() => {
          if (disabled) return
          setQuery('')
          setOpen(true)
        }}
        style={styles.input}
      >
        <Text style={selected ? styles.value : styles.placeholder}>
          {selectedText}
        </Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {open ? (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={close}
        >
          <View style={styles.overlay}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Dismiss ${label}`}
              style={StyleSheet.absoluteFill}
              onPress={close}
            />
            <View
              collapsable={false}
              testID={selectSheetTestId(label)}
              style={styles.sheet}
            >
              <Text accessibilityRole="header">{label}</Text>
              <TextInput
                accessibilityLabel={`Search ${label}`}
                testID={selectSearchTestId(label)}
                placeholder={SEARCH_PLACEHOLDER}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                autoCapitalize="none"
                style={styles.input}
              />
              <FlatList
                data={filtered}
                keyExtractor={(option) => option.id}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={<Text>{NO_RESULTS}</Text>}
                renderItem={({ item }) => {
                  const text = optionText(item)
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={text}
                      accessibilityState={{ selected: item.id === value }}
                      testID={selectOptionTestId(item.id)}
                      onPress={() => {
                        onChange(item.id)
                        close()
                      }}
                      style={styles.option}
                    >
                      <Text>{text}</Text>
                    </Pressable>
                  )
                }}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  )
}

export function ErrorBanner({
  message,
  testID,
}: {
  message: string
  testID?: string
}) {
  return (
    <Text accessibilityRole="alert" testID={testID} style={styles.error}>
      {message}
    </Text>
  )
}

const styles = StyleSheet.create({
  field: {
    width: '100%',
    gap: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  value: {
    color: '#111',
  },
  placeholder: {
    color: '#888',
  },
  error: {
    color: '#b00020',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    maxHeight: '70%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 12,
  },
  option: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
})
