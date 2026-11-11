import { useEffect, useRef, useState } from 'react'
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native'
import { ErrorBanner, Field, SelectField } from '../ui/fields'
import {
  BACK,
  LABEL_COFFEE,
  LABEL_DEVICE,
  LABEL_DOSE,
  LABEL_GRIND,
  LABEL_GRINDER,
  LABEL_NOTES,
  LABEL_ROAST_DATE,
  LABEL_TIME,
  LABEL_YIELD,
  LOG,
  LOG_ESPRESSO_HEADING,
  LOG_TEST_ID,
  SELECT_COFFEE,
  SELECT_DEVICE,
  SELECT_GRINDER,
  SHOT_FORM_A11Y_LABEL,
  SHOT_FORM_ERROR_TEST_ID,
  SHOT_FORM_HEADING_TEST_ID,
  SHOT_FORM_TEST_ID,
} from './copy'
import {
  applyCoffeePrefill,
  emptyShotDraft,
  parseShotDraft,
} from './draft'
import { newIdempotencyKey } from './idempotency'
import type { FieldErrors, ShotDraft } from './draft'
import type { EspressoCatalog, ShotCreate, ShotRow } from './types'

export function consumeHardwareBack(busy: boolean, onBack: () => void) {
  if (busy) return true
  onBack()
  return true
}

export function ShotForm({
  catalog,
  busy,
  error,
  onBack,
  onClearError,
  onSubmit,
  loadPrefill,
}: {
  catalog: EspressoCatalog
  busy: boolean
  error: string | null
  onBack: () => void
  onClearError: () => void
  onSubmit: (input: ShotCreate) => void
  loadPrefill: (coffeeId: string) => Promise<ShotRow | null>
}) {
  const [draft, setDraft] = useState<ShotDraft>(emptyShotDraft)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [idempotencyKey] = useState(newIdempotencyKey)
  const prefillSeq = useRef(0)

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () =>
      consumeHardwareBack(busy, onBack),
    )
    return () => sub.remove()
  }, [busy, onBack])

  const setField = (key: keyof ShotDraft, value: string) => {
    onClearError()
    setDraft((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  return (
    <ScrollView
      accessibilityLabel={SHOT_FORM_A11Y_LABEL}
      testID={SHOT_FORM_TEST_ID}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.form}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onBack}
      >
        <Text>{BACK}</Text>
      </Pressable>
      <Text
        accessibilityRole="header"
        testID={SHOT_FORM_HEADING_TEST_ID}
      >
        {LOG_ESPRESSO_HEADING}
      </Text>
      <SelectField
        label={LABEL_COFFEE}
        value={draft.coffeeId}
        options={catalog.coffees}
        placeholder={SELECT_COFFEE}
        error={fieldErrors.coffeeId}
        disabled={busy}
        onChange={(coffeeId) => {
          onClearError()
          setFieldErrors({})
          const seq = ++prefillSeq.current
          setDraft((current) => ({ ...current, coffeeId }))
          void loadPrefill(coffeeId).then(
            (latest) => {
              if (seq !== prefillSeq.current) return
              setDraft((current) =>
                applyCoffeePrefill(current, coffeeId, latest),
              )
            },
            () => {
              if (seq !== prefillSeq.current) return
              setDraft((current) => applyCoffeePrefill(current, coffeeId, null))
            },
          )
        }}
      />
      <SelectField
        label={LABEL_GRINDER}
        value={draft.grinderId}
        options={catalog.grinders}
        placeholder={SELECT_GRINDER}
        error={fieldErrors.grinderId}
        disabled={busy}
        onChange={(id) => setField('grinderId', id)}
      />
      <SelectField
        label={LABEL_DEVICE}
        value={draft.brewingDeviceId}
        options={catalog.devices}
        placeholder={SELECT_DEVICE}
        error={fieldErrors.brewingDeviceId}
        disabled={busy}
        onChange={(id) => setField('brewingDeviceId', id)}
      />
      <Field
        label={LABEL_ROAST_DATE}
        value={draft.roastDate}
        error={fieldErrors.roastDate}
        disabled={busy}
        onChange={(value) => setField('roastDate', value)}
      />
      <Field
        label={LABEL_DOSE}
        value={draft.dose}
        keyboardType="decimal-pad"
        error={fieldErrors.dose}
        disabled={busy}
        onChange={(value) => setField('dose', value)}
      />
      <Field
        label={LABEL_YIELD}
        value={draft.yield}
        keyboardType="decimal-pad"
        error={fieldErrors.yield}
        disabled={busy}
        onChange={(value) => setField('yield', value)}
      />
      <Field
        label={LABEL_TIME}
        value={draft.time}
        keyboardType="number-pad"
        error={fieldErrors.time}
        disabled={busy}
        onChange={(value) => setField('time', value)}
      />
      <Field
        label={LABEL_GRIND}
        value={draft.grindSetting}
        error={fieldErrors.grindSetting}
        disabled={busy}
        onChange={(value) => setField('grindSetting', value)}
      />
      <Field
        label={LABEL_NOTES}
        value={draft.notes}
        multiline
        disabled={busy}
        onChange={(value) => setField('notes', value)}
      />
      {error ? (
        <ErrorBanner message={error} testID={SHOT_FORM_ERROR_TEST_ID} />
      ) : null}
      <Pressable
        accessibilityRole="button"
        testID={LOG_TEST_ID}
        disabled={busy}
        onPress={() => {
          const parsed = parseShotDraft(draft)
          if (!parsed.ok) {
            setFieldErrors(parsed.errors)
            return
          }
          onSubmit({ ...parsed.value, idempotencyKey })
        }}
      >
        <Text>{LOG}</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  form: {
    width: '100%',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
})
