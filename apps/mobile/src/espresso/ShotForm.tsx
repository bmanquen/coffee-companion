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
  ERROR_PREFILL_FAILED,
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
  SHOT_FORM_PREFILL_ERROR_TEST_ID,
  SHOT_FORM_TEST_ID,
  TRY_AGAIN,
} from './copy'
import {
  applyCoffeePrefill,
  emptyShotDraft,
  parseShotDraft,
} from './draft'
import { newIdempotencyKey } from './idempotency'
import type { FieldErrors, PrefillKeep, ShotDraft } from './draft'
import type { EspressoCatalog, ShotCreate, ShotRow } from './types'

export function consumeHardwareBack(busy: boolean, onBack: () => void) {
  if (busy) return true
  onBack()
  return true
}

function draftFingerprint(input: Omit<ShotCreate, 'idempotencyKey'>) {
  return JSON.stringify(input)
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
  const [prefillError, setPrefillError] = useState(false)
  const idempotencyKey = useRef(newIdempotencyKey())
  const lastSubmitted = useRef<string | null>(null)
  const prefillSeq = useRef(0)
  const prefillCoffeeId = useRef('')
  const keepPrefill = useRef<PrefillKeep>({})

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () =>
      consumeHardwareBack(busy, onBack),
    )
    return () => sub.remove()
  }, [busy, onBack])

  const setField = (key: keyof ShotDraft, value: string) => {
    onClearError()
    if (key === 'grinderId' || key === 'brewingDeviceId' || key === 'roastDate') {
      keepPrefill.current = { ...keepPrefill.current, [key]: true }
    }
    setDraft((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const applyPrefill = (coffeeId: string, seq: number, latest: ShotRow | null) => {
    if (seq !== prefillSeq.current || coffeeId !== prefillCoffeeId.current) {
      return
    }
    setDraft((current) =>
      applyCoffeePrefill(current, coffeeId, latest, keepPrefill.current),
    )
  }

  const requestPrefill = (coffeeId: string) => {
    const seq = ++prefillSeq.current
    prefillCoffeeId.current = coffeeId
    setPrefillError(false)
    void loadPrefill(coffeeId).then(
      (latest) => applyPrefill(coffeeId, seq, latest),
      () => {
        if (seq !== prefillSeq.current || coffeeId !== prefillCoffeeId.current) {
          return
        }
        setPrefillError(true)
        applyPrefill(coffeeId, seq, null)
      },
    )
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
          keepPrefill.current = {}
          setDraft((current) => ({ ...current, coffeeId, roastDate: '' }))
          requestPrefill(coffeeId)
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
      {prefillError ? (
        <>
          <ErrorBanner
            message={ERROR_PREFILL_FAILED}
            testID={SHOT_FORM_PREFILL_ERROR_TEST_ID}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              if (prefillCoffeeId.current) requestPrefill(prefillCoffeeId.current)
            }}
          >
            <Text>{TRY_AGAIN}</Text>
          </Pressable>
        </>
      ) : null}
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
          const fingerprint = draftFingerprint(parsed.value)
          if (
            lastSubmitted.current != null &&
            lastSubmitted.current !== fingerprint
          ) {
            idempotencyKey.current = newIdempotencyKey()
          }
          lastSubmitted.current = fingerprint
          onSubmit({ ...parsed.value, idempotencyKey: idempotencyKey.current })
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
