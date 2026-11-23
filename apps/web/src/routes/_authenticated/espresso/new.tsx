import { insertEspressoShotSchema } from '@coffee-companion/api/db/zod'
import { applyCoffeePrefill } from '@coffee-companion/brew-display'
import {
  ESPRESSO_DEVICE_TYPE,
  SHOT_IDEMPOTENCY_DELETED,
  isEspressoDevice,
  normalizeDecimal,
} from '@coffee-companion/api/lib/espresso'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DeviceDialedInReference } from '@/components/brews/device-dialed-in-reference'
import { brewsLogLocation } from '@/components/brews/methods'
import { FormBanner } from '@/components/form/form-banner'
import { MutationErrorNotices } from '@/components/form/mutation-error-notices'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAppForm } from '@/hooks/form'
import { useBrewingDeviceSelect } from '@/hooks/use-brewing-device-select'
import { refreshEspressoShotReads } from '@/hooks/use-espresso-shot-pages'
import { useSearchSelectResource } from '@/hooks/use-search-select-resource'
import { useTRPC } from '@/integrations/trpc/react'
import { track } from '@/lib/analytics'
import {
  rememberSubmittedValues,
  submitFormMutation,
  submittedValuesKey,
  trpcErrorCode,
} from '@/lib/form-error'
import type { PrefillKeep } from '@coffee-companion/brew-display'
import type { InsertEspressoShot } from '@coffee-companion/api/db/zod'

export const Route = createFileRoute('/_authenticated/espresso/new')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.coffee.getAll.queryOptions(),
    )
    await context.queryClient.ensureQueryData(
      context.trpc.grinder.list.queryOptions(),
    )
    await context.queryClient.ensureQueryData(
      context.trpc.brewingDevice.list.queryOptions(),
    )
  },
  component: NewEspressoShot,
})

const PREFILL_FAILED =
  "We couldn't load this coffee's last shot. Enter it yourself, or try again."

// An emptied Notes field holds '' where an untouched one holds null; both
// mean no notes, and are sent and fingerprinted as null.
function withBlankNotesAsNull(value: InsertEspressoShot): InsertEspressoShot {
  return { ...value, notes: value.notes || null }
}

// Matches the API's replay check, so 18 and 18.0, or 30 and 030, reuse the
// same key.
function draftFingerprint(value: InsertEspressoShot) {
  const time = value.time as number | string | null
  return JSON.stringify({
    ...withBlankNotesAsNull(value),
    dose: normalizeDecimal(value.dose),
    yield: normalizeDecimal(value.yield),
    time: typeof time === 'string' && /^\d+$/.test(time) ? Number(time) : time,
  })
}

// The fields a user types for each shot, apart from the coffee and the gear
// and roast date its prefill carries forward.
const RECIPE_FIELDS = new Set([
  'dose',
  'yield',
  'time',
  'grindSetting',
  'notes',
])

function recipeFingerprint(value: InsertEspressoShot) {
  return draftFingerprint({
    ...value,
    coffeeId: '',
    grinderId: '',
    brewingDeviceId: '',
    roastDate: null,
  })
}

// A 4xx means the API answered before inserting anything; a network failure
// or 5xx may have come after the shot was saved.
function rejectedBeforeSave(error: unknown) {
  const status = (error as { data?: { httpStatus?: unknown } } | null)?.data
    ?.httpStatus
  return typeof status === 'number' && status >= 400 && status < 500
}

type PrefillSource = {
  grinderId: string | null
  brewingDeviceId: string | null
  roastDate: string | null
}

export function NewEspressoShot() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const idempotencyKeys = useRef(new Map<string, string>())
  const prefillSeq = useRef(0)
  const prefillCoffeeId = useRef('')
  const keepPrefill = useRef<PrefillKeep>({})
  const applyingPrefill = useRef(false)
  const saveGen = useRef(0)
  const saveInFlight = useRef(false)
  const saveSucceeded = useRef(false)
  const prefillQueued = useRef(false)
  // The prefill lookup in flight, if any, with the selection turn it serves.
  // A save drops its result, so when that save is then refused outright the
  // lookup is started again.
  const pendingLookup = useRef<{ seq: number } | null>(null)
  const saveInterruptedLookup = useRef(false)
  const saveRejected = useRef(false)
  // The coffee of a save the API just reported deleted, if any.
  const savedKeyDeletedFor = useRef('')
  // The prefill turn and recipe the form held when the last save was sent.
  const submittedAt = useRef({ seq: 0, recipe: '' })
  // The gear and roast date of each save that may have committed, by coffee
  // and then by idempotency key, newest last, so a retry of any of them can
  // send what it first sent.
  const unresolvedSaves = useRef(
    new Map<string, Map<string, PrefillSource & { recipe: string }>>(),
  )
  const [prefillError, setPrefillError] = useState(false)

  const { data: coffees } = useSuspenseQuery(trpc.coffee.getAll.queryOptions())
  const coffee = useSearchSelectResource(coffees)

  const { data: grinders } = useSuspenseQuery(trpc.grinder.list.queryOptions())
  const grinder = useSearchSelectResource(grinders)

  const { data: brewingDevices } = useSuspenseQuery(
    trpc.brewingDevice.list.queryOptions(),
  )

  // Espresso shots must be brewed on an Espresso-type device (enforced again
  // server-side in espressoShot.create).
  const brewingDevice = useBrewingDeviceSelect(ESPRESSO_DEVICE_TYPE)

  // A save that settles after the user left the form must not pull them
  // back to Brews; it still refreshes the cached reads.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const createShot = useMutation(
    trpc.espressoShot.create.mutationOptions({
      onSuccess: async () => {
        saveSucceeded.current = true
        idempotencyKeys.current.clear()
        track('brew_logged', { method: 'espresso' })
        // A Brews preload begun before the save would otherwise land without
        // this shot and look fresh when the log opens.
        await refreshEspressoShotReads(queryClient, trpc)
        if (mounted.current) navigate(brewsLogLocation('espresso'))
      },
    }),
  )

  const defaultShot = {
    coffeeId: '',
    grinderId: '',
    brewingDeviceId: '',
    roastDate: null,
    dose: '',
    yield: '',
    time: null,
    grindSetting: '',
    notes: null,
  } as unknown as InsertEspressoShot

  const form = useAppForm({
    defaultValues: defaultShot,
    validators: {
      onChange: insertEspressoShotSchema as never,
    },
    listeners: {
      // Editing the recipe back to a lost save's restores that save's gear
      // and roast date, so its retry replays rather than saving a new shot.
      // An edit made while a save is pending is checked once it settles.
      onChange: ({ fieldApi }) => {
        if (!RECIPE_FIELDS.has(fieldApi.name) || saveInFlight.current) return
        restoreMatchingSave()
      },
    },
    onSubmit: async ({ value: submitted }) => {
      const value = withBlankNotesAsNull(submitted)
      const fingerprint = draftFingerprint(value)
      let idempotencyKey = idempotencyKeys.current.get(fingerprint)
      if (!idempotencyKey) {
        idempotencyKey = crypto.randomUUID()
        idempotencyKeys.current.set(fingerprint, idempotencyKey)
      }
      saveGen.current += 1
      const outcome = { keyDeleted: false, rejected: false }
      await submitFormMutation(
        form,
        (input: Parameters<typeof createShot.mutateAsync>[0]) =>
          createShot.mutateAsync(input).catch((error: unknown) => {
            outcome.keyDeleted =
              trpcErrorCode(error) === 'CONFLICT' &&
              error instanceof Error &&
              error.message === SHOT_IDEMPOTENCY_DELETED
            outcome.rejected = rejectedBeforeSave(error)
            throw error
          }),
        { ...value, idempotencyKey },
      )
      saveRejected.current = outcome.rejected
      if (!outcome.rejected) {
        // A read from before a save that may have written is stale, and a
        // later lookup would join it rather than read afresh.
        // Only this coffee's: another form's lookup for another coffee
        // reads a latest shot this save cannot change.
        void queryClient.cancelQueries(
          trpc.espressoShot.getLatestUnsealed.queryFilter({
            coffeeId: value.coffeeId,
          }),
        )
      }
      savedKeyDeletedFor.current = outcome.keyDeleted ? value.coffeeId : ''
      const forgetKey = () => {
        for (const [draft, key] of idempotencyKeys.current) {
          if (key === idempotencyKey) idempotencyKeys.current.delete(draft)
        }
      }
      if (outcome.keyDeleted) {
        // That shot is gone for good, so the next Log saves a new one.
        forgetKey()
        // Only its own snapshot: another save of the recipe under another
        // key may still have committed.
        unresolvedSaves.current.get(value.coffeeId)?.delete(idempotencyKey)
      } else if (outcome.rejected) {
        // A refused save committed nothing, so a prefill must not carry its
        // key into another draft, unless an earlier lost attempt under that
        // key may still have committed and must replay.
        if (!unresolvedSaves.current.get(value.coffeeId)?.has(idempotencyKey)) {
          forgetKey()
        }
      } else if (!saveSucceeded.current) {
        // Only a save that may have committed must replay as submitted.
        const saves =
          unresolvedSaves.current.get(value.coffeeId) ??
          new Map<string, PrefillSource & { recipe: string }>()
        saves.delete(idempotencyKey)
        saves.set(idempotencyKey, {
          grinderId: value.grinderId,
          brewingDeviceId: value.brewingDeviceId,
          roastDate: value.roastDate ?? null,
          recipe: recipeFingerprint(value),
        })
        unresolvedSaves.current.set(value.coffeeId, saves)
      }
    },
  })

  const applyPrefill = (
    coffeeId: string,
    seq: number,
    latest: PrefillSource | null,
    startedSaveGen: number,
  ) => {
    if (seq !== prefillSeq.current || coffeeId !== prefillCoffeeId.current) {
      return
    }
    if (startedSaveGen !== saveGen.current) return
    // Log marks the save in flight before validation, and saveGen moves only
    // once it passes, so a lookup landing in between waits for the save to
    // settle instead of changing what it sends.
    if (saveInFlight.current) {
      prefillQueued.current = true
      return
    }
    const keep = keepPrefill.current
    const values = form.state.values
    const next = applyCoffeePrefill(
      {
        coffeeId,
        grinderId: values.grinderId,
        brewingDeviceId: values.brewingDeviceId,
        roastDate: values.roastDate ?? null,
      },
      coffeeId,
      latest,
      keep,
      null,
    )
    // The lists as they are now: a refresh during the lookup may have dropped
    // or retyped this gear since the render that started it.
    const currentGrinders =
      queryClient.getQueryData(trpc.grinder.list.queryKey()) ?? grinders
    const currentDevices =
      queryClient.getQueryData(trpc.brewingDevice.list.queryKey()) ??
      brewingDevices
    const device = currentDevices.find(
      (item) => item.id === next.brewingDeviceId,
    )
    const priorKey = idempotencyKeys.current.get(
      draftFingerprint(form.state.values),
    )
    // The save's error stays shown while the form holds what was submitted.
    const errorShown =
      submittedValuesKey(form) === JSON.stringify(form.state.values)
    applyingPrefill.current = true
    if (!keep.grinderId) {
      form.setFieldValue(
        'grinderId',
        currentGrinders.some((item) => item.id === next.grinderId)
          ? next.grinderId
          : '',
      )
    }
    if (!keep.brewingDeviceId) {
      form.setFieldValue(
        'brewingDeviceId',
        device && isEspressoDevice(device) ? device.id : '',
      )
    }
    if (!keep.roastDate) form.setFieldValue('roastDate', next.roastDate)
    applyingPrefill.current = false
    // A prefill is not an edit, so it keeps that error up, and a lost save
    // must replay under its first key.
    if (errorShown) rememberSubmittedValues(form, form.state.values)
    const fingerprint = draftFingerprint(form.state.values)
    if (priorKey && !idempotencyKeys.current.has(fingerprint)) {
      idempotencyKeys.current.set(fingerprint, priorKey)
    }
  }

  const loadPrefillFor = (coffeeId: string) => {
    if (!coffeeId) return
    if (saveInFlight.current) {
      prefillQueued.current = true
      return
    }
    prefillQueued.current = false
    const seq = prefillSeq.current
    const startedSaveGen = saveGen.current
    // After a save whose response was lost, its retry must send the same
    // payload, so restore what was submitted instead of any shot read since.
    // The newest with the form's recipe if there is one, else the newest.
    const saves = [...(unresolvedSaves.current.get(coffeeId)?.values() ?? [])]
    const recipe = recipeFingerprint({ ...form.state.values, coffeeId })
    const unresolved =
      saves.filter((save) => save.recipe === recipe).at(-1) ?? saves.at(-1)
    if (unresolved) {
      applyPrefill(coffeeId, seq, unresolved, startedSaveGen)
      return
    }
    const lookup = { seq }
    pendingLookup.current = lookup
    void queryClient
      .fetchQuery({
        ...trpc.espressoShot.getLatestUnsealed.queryOptions({ coffeeId }),
        staleTime: 0,
      })
      .finally(() => {
        if (pendingLookup.current === lookup) pendingLookup.current = null
      })
      .then(
        (latest) => applyPrefill(coffeeId, seq, latest, startedSaveGen),
        () => {
          if (
            seq !== prefillSeq.current ||
            coffeeId !== prefillCoffeeId.current
          ) {
            return
          }
          // A lookup from before a save is dropped, its failure included.
          if (startedSaveGen !== saveGen.current) return
          if (saveInFlight.current) {
            prefillQueued.current = true
            return
          }
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

  // Restores the gear and roast date of the lost save whose recipe the form
  // now holds, if any, in fields not set by hand.
  const restoreMatchingSave = () => {
    const values = form.state.values
    if (!values.coffeeId || values.coffeeId !== prefillCoffeeId.current) return
    const recipe = recipeFingerprint(values)
    const match = [
      ...(unresolvedSaves.current.get(values.coffeeId)?.values() ?? []),
    ]
      .filter((save) => save.recipe === recipe)
      .at(-1)
    if (match) {
      applyPrefill(values.coffeeId, prefillSeq.current, match, saveGen.current)
    }
  }

  const flushQueuedPrefill = () => {
    saveInFlight.current = false
    // Only a save the API refused outright: after one that may have
    // committed, a lookup from before it is stale.
    const resume = saveInterruptedLookup.current && saveRejected.current
    saveInterruptedLookup.current = false
    if (saveSucceeded.current || !prefillCoffeeId.current) return
    // The draft just sent is the one to save anew: an older lost save of
    // its recipe waits for a reselection or an edit back to it, unless one
    // of those already happened while the save was out.
    if (
      savedKeyDeletedFor.current === prefillCoffeeId.current &&
      submittedAt.current.seq === prefillSeq.current &&
      submittedAt.current.recipe === recipeFingerprint(form.state.values)
    ) {
      return
    }
    if (prefillQueued.current || resume) {
      loadPrefillFor(prefillCoffeeId.current)
    } else if (
      // Only an edit made while the save was out; the draft just sent stays.
      submittedAt.current.recipe !== recipeFingerprint(form.state.values)
    ) {
      restoreMatchingSave()
    }
  }

  const markTouched = (key: keyof PrefillKeep) => {
    if (applyingPrefill.current) return
    keepPrefill.current = { ...keepPrefill.current, [key]: true }
  }

  return (
    <Card className="flex flex-col items-center w-full max-w-2xl mx-auto p-4">
      <H1 className="text-start w-full max-w-md">Log Espresso Shot</H1>
      <form
        className="w-full max-w-md flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          // A second submit would clear the in-flight flag when it returns,
          // while the first save is still pending. After a save succeeded its
          // keys are cleared, so another submit before Brews opens would
          // save the shot twice.
          if (saveInFlight.current || saveSucceeded.current) return
          saveRejected.current = false
          savedKeyDeletedFor.current = ''
          // Only a lookup for the current selection; one left from an
          // earlier coffee is not this draft's to resume.
          saveInterruptedLookup.current =
            pendingLookup.current?.seq === prefillSeq.current
          submittedAt.current = {
            seq: prefillSeq.current,
            recipe: recipeFingerprint(form.state.values),
          }
          saveInFlight.current = true
          void form.handleSubmit().finally(() => {
            flushQueuedPrefill()
          })
        }}
      >
        <form.AppField
          name="coffeeId"
          listeners={{
            // Carry the setup and roast date forward from the coffee's most
            // recent shot. The recipe (dose/yield/time/grind) is left blank so
            // it's entered fresh each shot.
            onChange: ({ value }) => {
              if (!value) {
                prefillSeq.current += 1
                prefillCoffeeId.current = ''
                setPrefillError(false)
                const keep = keepPrefill.current
                applyingPrefill.current = true
                if (!keep.roastDate) form.setFieldValue('roastDate', null)
                if (!keep.grinderId) form.setFieldValue('grinderId', '')
                if (!keep.brewingDeviceId) {
                  form.setFieldValue('brewingDeviceId', '')
                }
                applyingPrefill.current = false
                return
              }
              const keep = keepPrefill.current
              keepPrefill.current = {
                grinderId: keep.grinderId,
                brewingDeviceId: keep.brewingDeviceId,
              }
              applyingPrefill.current = true
              form.setFieldValue('roastDate', null)
              if (!keep.grinderId) form.setFieldValue('grinderId', '')
              if (!keep.brewingDeviceId) {
                form.setFieldValue('brewingDeviceId', '')
              }
              applyingPrefill.current = false
              requestPrefill(value)
            },
          }}
        >
          {(field) => <field.SearchSelect label="Coffee" {...coffee} />}
        </form.AppField>
        <form.AppField
          name="grinderId"
          listeners={{
            onChange: () => markTouched('grinderId'),
          }}
        >
          {(field) => <field.SearchSelect label="Grinder" {...grinder} />}
        </form.AppField>
        <form.AppField
          name="brewingDeviceId"
          listeners={{
            onChange: () => markTouched('brewingDeviceId'),
          }}
        >
          {(field) => (
            <>
              <field.SearchSelect label="Brewing Device" {...brewingDevice} />
              <form.Subscribe selector={(state) => state.values.coffeeId}>
                {(coffeeId) => (
                  <DeviceDialedInReference
                    coffeeId={coffeeId}
                    brewingMethod="espresso"
                    brewingDeviceId={field.state.value}
                  />
                )}
              </form.Subscribe>
            </>
          )}
        </form.AppField>
        <form.AppField
          name="roastDate"
          listeners={{
            onChange: () => markTouched('roastDate'),
          }}
        >
          {(field) => <field.DatePicker label="Roast Date" />}
        </form.AppField>
        <form.AppField name="dose">
          {(field) => (
            <field.TextField
              label="Dose (g)"
              type="number"
              step="any"
              inputMode="decimal"
            />
          )}
        </form.AppField>
        <form.AppField name="yield">
          {(field) => (
            <field.TextField
              label="Yield (g)"
              type="number"
              step="any"
              inputMode="decimal"
            />
          )}
        </form.AppField>
        <form.AppField name="time">
          {(field) => <field.TextField label="Time (s)" type="number" />}
        </form.AppField>
        <form.AppField name="grindSetting">
          {(field) => <field.TextField label="Grind Setting" />}
        </form.AppField>
        <form.AppField name="notes">
          {(field) => (
            <field.TextArea label="Notes" placeholder="Tasting notes..." />
          )}
        </form.AppField>
        {prefillError ? (
          <>
            <FormBanner message={PREFILL_FAILED} />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (prefillCoffeeId.current) {
                  requestPrefill(prefillCoffeeId.current)
                }
              }}
            >
              Try again
            </Button>
          </>
        ) : null}
        <MutationErrorNotices
          error={createShot.error}
          reset={createShot.reset}
          form={form}
        />
        <Button
          type="submit"
          disabled={createShot.isPending || createShot.isSuccess}
          aria-busy={createShot.isPending}
        >
          {createShot.isPending ? 'Logging…' : 'Log'}
          <Plus />
        </Button>
      </form>
    </Card>
  )
}
