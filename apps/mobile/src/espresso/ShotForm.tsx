import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { applyCoffeePrefill } from '@coffee-companion/brew-display'
import { normalizeDecimal } from '@coffee-companion/api/lib/espresso'
import {
  AccessibilityInfo,
  BackHandler,
  KeyboardAvoidingView,
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
  LOGGING,
  LOG_ESPRESSO_HEADING,
  LOG_TEST_ID,
  SELECT_COFFEE,
  SELECT_DEVICE,
  SELECT_GRINDER,
  SHOT_FORM_A11Y_LABEL,
  SHOT_FORM_ERROR_TEST_ID,
  SHOT_FORM_HEADING_TEST_ID,
  SHOT_FORM_KEYBOARD_TEST_ID,
  SHOT_FORM_PREFILL_ERROR_TEST_ID,
  SHOT_FORM_TEST_ID,
  TRY_AGAIN,
} from './copy'
import {
  decimalFieldText,
  emptyShotDraft,
  parseShotDraft,
} from './draft'
import { newIdempotencyKey } from './idempotency'
import type { PrefillKeep } from '@coffee-companion/brew-display'
import type { FieldErrors, ShotDraft } from './draft'
import type { EspressoCatalog, ShotCreate, ShotRow } from './types'

export function consumeHardwareBack(busy: boolean, onBack: () => void) {
  if (busy) return true
  onBack()
  return true
}

function draftFingerprint(input: Omit<ShotCreate, 'idempotencyKey'>) {
  return JSON.stringify({
    ...input,
    dose: normalizeDecimal(input.dose),
    yield: normalizeDecimal(input.yield),
  })
}

export function ShotForm({
  catalog,
  busy,
  error,
  onBack,
  onClearError,
  onSubmit,
  loadPrefill,
  idempotencyKeys,
}: {
  catalog: EspressoCatalog
  busy: boolean
  error: string | null
  onBack: () => void
  onClearError: () => void
  onSubmit: (input: ShotCreate) => void
  loadPrefill: (coffeeId: string) => Promise<ShotRow | null>
  // Owned above the form so a save whose response was lost replays after Back.
  idempotencyKeys: Map<string, string>
}) {
  const [draft, setDraft] = useState<ShotDraft>(emptyShotDraft)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [prefillError, setPrefillError] = useState(false)
  const prefillSeq = useRef(0)
  const prefillCoffeeId = useRef('')
  const keepPrefill = useRef<PrefillKeep>({})
  const saveGen = useRef(0)
  const saveInFlight = useRef(false)
  const prefillQueued = useRef(false)
  const draftRef = useRef(draft)
  useLayoutEffect(() => {
    // After commit: a discarded render must not leak an uncommitted draft.
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () =>
      consumeHardwareBack(busy, onBack),
    )
    return () => sub.remove()
  }, [busy, onBack])

  const setField = (key: keyof ShotDraft, value: string) => {
    onClearError()
    const next =
      key === 'dose' || key === 'yield' ? decimalFieldText(value) : value
    if (key === 'grinderId' || key === 'brewingDeviceId' || key === 'roastDate') {
      keepPrefill.current = { ...keepPrefill.current, [key]: true }
    }
    setDraft((current) => ({ ...current, [key]: next }))
    setFieldErrors((current) => {
      if (!current[key]) return current
      const remaining = { ...current }
      delete remaining[key]
      return remaining
    })
  }

  const applyPrefill = (
    coffeeId: string,
    seq: number,
    latest: ShotRow | null,
    startedSaveGen: number,
  ) => {
    if (seq !== prefillSeq.current || coffeeId !== prefillCoffeeId.current) {
      return
    }
    if (startedSaveGen !== saveGen.current) return
    const fill = (current: ShotDraft) => {
      const next = applyCoffeePrefill(
        current,
        coffeeId,
        latest,
        keepPrefill.current,
        '',
      )
      // A legacy shot can name gear the user cannot pick (or no longer has);
      // prefilling it would show a blank select and fail on Log.
      const keepGrinder =
        keepPrefill.current.grinderId ||
        catalog.grinders.some((grinder) => grinder.id === next.grinderId)
      const keepDevice =
        keepPrefill.current.brewingDeviceId ||
        catalog.devices.some((device) => device.id === next.brewingDeviceId)
      return {
        ...next,
        grinderId: keepGrinder ? next.grinderId : '',
        brewingDeviceId: keepDevice ? next.brewingDeviceId : '',
      }
    }
    // A queued edit has already cleared its own error, so the committed draft suffices here.
    const filled = fill(draftRef.current)
    // A prefill is not an edit: a lost save must replay under its first key.
    const before = parseShotDraft(draftRef.current)
    const after = parseShotDraft(filled)
    // Another coffee in the committed draft means the coffee was changed, which
    // is an edit, so its key must not carry over.
    const priorKey =
      before.ok && before.value.coffeeId === coffeeId
        ? idempotencyKeys.get(draftFingerprint(before.value))
        : undefined
    const fingerprint = after.ok ? draftFingerprint(after.value) : undefined
    if (priorKey && fingerprint && !idempotencyKeys.has(fingerprint)) {
      idempotencyKeys.set(fingerprint, priorKey)
    }
    setDraft(fill)
    setFieldErrors((current) => {
      const updated = { ...current }
      let changed = false
      if (filled.grinderId && updated.grinderId) {
        delete updated.grinderId
        changed = true
      }
      if (filled.brewingDeviceId && updated.brewingDeviceId) {
        delete updated.brewingDeviceId
        changed = true
      }
      if (!keepPrefill.current.roastDate && updated.roastDate) {
        delete updated.roastDate
        changed = true
      }
      return changed ? updated : current
    })
  }

  const loadPrefillFor = (coffeeId: string) => {
    if (!coffeeId) return
    if (saveInFlight.current || busy) {
      prefillQueued.current = true
      return
    }
    prefillQueued.current = false
    const seq = prefillSeq.current
    const startedSaveGen = saveGen.current
    void loadPrefill(coffeeId).then(
      (latest) => applyPrefill(coffeeId, seq, latest, startedSaveGen),
      () => {
        if (seq !== prefillSeq.current || coffeeId !== prefillCoffeeId.current) {
          return
        }
        // A lookup from before a save is dropped, its failure included.
        if (startedSaveGen !== saveGen.current) return
        setPrefillError(true)
        applyPrefill(coffeeId, seq, null, startedSaveGen)
      },
    )
  }

  const requestPrefill = (coffeeId: string) => {
    prefillSeq.current += 1
    prefillCoffeeId.current = coffeeId
    setPrefillError(false)
    loadPrefillFor(coffeeId)
  }

  useEffect(() => {
    if (!error) return
    saveInFlight.current = false
    if (prefillQueued.current && prefillCoffeeId.current) {
      loadPrefillFor(prefillCoffeeId.current)
    }
  }, [error])

  return (
    <KeyboardAvoidingView
      // Android IME overlays this ScrollView instead of resizing it, so
      // padding applies on both platforms. The picker sheet leaves Android
      // undefined because it lives in a Modal.
      behavior="padding"
      testID={SHOT_FORM_KEYBOARD_TEST_ID}
      style={styles.keyboard}
    >
    <ScrollView
      accessibilityLabel={SHOT_FORM_A11Y_LABEL}
      testID={SHOT_FORM_TEST_ID}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.form}
      style={styles.scroll}
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
          // The roast date is reset below, so its old error no longer applies.
          setFieldErrors((current) => {
            if (!current.coffeeId && !current.roastDate) return current
            const next = { ...current }
            delete next.coffeeId
            delete next.roastDate
            return next
          })
          const keep = keepPrefill.current
          keepPrefill.current = {
            grinderId: keep.grinderId,
            brewingDeviceId: keep.brewingDeviceId,
          }
          setDraft((current) => ({
            ...current,
            coffeeId,
            roastDate: '',
            grinderId: keep.grinderId ? current.grinderId : '',
            brewingDeviceId: keep.brewingDeviceId
              ? current.brewingDeviceId
              : '',
          }))
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
        accessibilityState={{ disabled: busy, busy }}
        testID={LOG_TEST_ID}
        disabled={busy}
        onPress={() => {
          const parsed = parseShotDraft(draft)
          if (!parsed.ok) {
            setFieldErrors(parsed.errors)
            // Otherwise a screen reader hears nothing when Log is refused.
            AccessibilityInfo.announceForAccessibility(
              Object.values(parsed.errors).join('. '),
            )
            return
          }
          const fingerprint = draftFingerprint(parsed.value)
          let idempotencyKey = idempotencyKeys.get(fingerprint)
          if (!idempotencyKey) {
            idempotencyKey = newIdempotencyKey()
            idempotencyKeys.set(fingerprint, idempotencyKey)
          }
          saveInFlight.current = true
          saveGen.current += 1
          onSubmit({ ...parsed.value, idempotencyKey })
        }}
      >
        <Text>{busy ? LOGGING : LOG}</Text>
      </Pressable>
    </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  form: {
    width: '100%',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
})
