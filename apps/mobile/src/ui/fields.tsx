import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

export function Field({
  label,
  value,
  onChange,
  error,
  keyboardType = 'default',
  multiline = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad'
  multiline?: boolean
}) {
  return (
    <View style={styles.field}>
      <Text>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
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
}: {
  label: string
  value: string
  options: Array<{ id: string; name: string }>
  placeholder: string
  onChange: (id: string) => void
  error?: string
}) {
  const selected = options.find((option) => option.id === value)

  return (
    <View accessibilityLabel={label} style={styles.field}>
      <Text>{label}</Text>
      <Text>{selected?.name ?? placeholder}</Text>
      {options.map((option) => (
        <Pressable
          key={option.id}
          accessibilityRole="button"
          accessibilityLabel={option.name}
          accessibilityState={{ selected: option.id === value }}
          onPress={() => onChange(option.id)}
        >
          <Text>{option.name}</Text>
        </Pressable>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  error: {
    color: '#b00020',
  },
})
