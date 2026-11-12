import { insertEspressoShotSchema } from '@coffee-companion/api/db/zod'
import { ESPRESSO_DEVICE_TYPE } from '@coffee-companion/api/lib/espresso'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import type { InsertEspressoShot } from '@coffee-companion/api/db/zod'
import { DeviceDialedInReference } from '@/components/brews/device-dialed-in-reference'
import { brewsLogLocation } from '@/components/brews/methods'
import { FormBanner } from '@/components/form/form-banner'
import { MutationErrorNotices } from '@/components/form/mutation-error-notices'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAppForm } from '@/hooks/form'
import { useBrewingDeviceSelect } from '@/hooks/use-brewing-device-select'
import { useSearchSelectResource } from '@/hooks/use-search-select-resource'
import { useTRPC } from '@/integrations/trpc/react'
import { track } from '@/lib/analytics'
import { submitFormMutation } from '@/lib/form-error'

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

type PrefillKeep = {
  grinderId?: boolean
  brewingDeviceId?: boolean
  roastDate?: boolean
}

function draftFingerprint(value: InsertEspressoShot) {
  return JSON.stringify(value)
}

export function NewEspressoShot() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const idempotencyKey = useRef(crypto.randomUUID())
  const lastSubmitted = useRef<string | null>(null)
  const prefillSeq = useRef(0)
  const prefillCoffeeId = useRef('')
  const keepPrefill = useRef<PrefillKeep>({})
  const applyingPrefill = useRef(false)
  const [prefillError, setPrefillError] = useState(false)

  const { data: coffees } = useSuspenseQuery(trpc.coffee.getAll.queryOptions())
  const coffee = useSearchSelectResource(coffees)

  const { data: grinders } = useSuspenseQuery(trpc.grinder.list.queryOptions())
  const grinder = useSearchSelectResource(grinders)

  // Espresso shots must be brewed on an Espresso-type device (enforced again
  // server-side in espressoShot.create).
  const brewingDevice = useBrewingDeviceSelect(ESPRESSO_DEVICE_TYPE)

  const createShot = useMutation(
    trpc.espressoShot.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.espressoShot.getRecent.queryFilter())
        queryClient.invalidateQueries(
          trpc.espressoShot.getLatestUnsealed.queryFilter(),
        )
        idempotencyKey.current = crypto.randomUUID()
        lastSubmitted.current = null
        track('brew_logged', { method: 'espresso' })
        navigate(brewsLogLocation('espresso'))
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
    onSubmit: async ({ value }) => {
      const fingerprint = draftFingerprint(value)
      if (
        lastSubmitted.current != null &&
        lastSubmitted.current !== fingerprint
      ) {
        idempotencyKey.current = crypto.randomUUID()
      }
      lastSubmitted.current = fingerprint
      await submitFormMutation(form, createShot.mutateAsync, {
        ...value,
        idempotencyKey: idempotencyKey.current,
      })
    },
  })

  const applyPrefill = (
    coffeeId: string,
    seq: number,
    latest: {
      grinderId: string | null
      brewingDeviceId: string | null
      roastDate: string | null
    } | null,
  ) => {
    if (seq !== prefillSeq.current || coffeeId !== prefillCoffeeId.current) {
      return
    }
    const keep = keepPrefill.current
    applyingPrefill.current = true
    if (latest?.grinderId && latest.brewingDeviceId) {
      if (!keep.grinderId) form.setFieldValue('grinderId', latest.grinderId)
      if (!keep.brewingDeviceId) {
        form.setFieldValue('brewingDeviceId', latest.brewingDeviceId)
      }
      if (!keep.roastDate) form.setFieldValue('roastDate', latest.roastDate)
    }
    applyingPrefill.current = false
  }

  const requestPrefill = (coffeeId: string) => {
    const seq = ++prefillSeq.current
    prefillCoffeeId.current = coffeeId
    setPrefillError(false)
    void queryClient
      .fetchQuery({
        ...trpc.espressoShot.getLatestUnsealed.queryOptions({ coffeeId }),
        staleTime: Infinity,
      })
      .then(
        (latest) => applyPrefill(coffeeId, seq, latest),
        () => {
          if (
            seq !== prefillSeq.current ||
            coffeeId !== prefillCoffeeId.current
          ) {
            return
          }
          setPrefillError(true)
          applyPrefill(coffeeId, seq, null)
        },
      )
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
          form.handleSubmit()
        }}
      >
        <form.AppField
          name="coffeeId"
          listeners={{
            // Carry the setup and roast date forward from the coffee's most
            // recent shot. The recipe (dose/yield/time/grind) is left blank so
            // it's entered fresh each shot.
            onChange: ({ value }) => {
              if (!value) return
              keepPrefill.current = {}
              applyingPrefill.current = true
              form.setFieldValue('roastDate', null)
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
        <Button type="submit" disabled={createShot.isPending}>
          Log
          <Plus />
        </Button>
      </form>
    </Card>
  )
}
