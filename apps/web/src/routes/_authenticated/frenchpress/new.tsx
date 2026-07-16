import { insertFrenchpressBrewSchema } from '@coffee-companion/api/db/zod'
import { FRENCH_PRESS_DEVICE_TYPE } from '@coffee-companion/api/lib/frenchpress'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import type { InsertFrenchpressBrew } from '@coffee-companion/api/db/zod'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAppForm } from '@/hooks/form'
import { useSearchSelectResource } from '@/hooks/use-search-select-resource'
import { useTRPC } from '@/integrations/trpc/react'

export const Route = createFileRoute('/_authenticated/frenchpress/new')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.coffee.getAll.queryOptions(),
    )
    await context.queryClient.ensureQueryData(
      context.trpc.frenchpressMethod.list.queryOptions(),
    )
    await context.queryClient.ensureQueryData(
      context.trpc.grinder.list.queryOptions(),
    )
    await context.queryClient.ensureQueryData(
      context.trpc.brewingDevice.list.queryOptions(),
    )
    // Used to prefill the form from the coffee's most recent brew.
    await context.queryClient.ensureQueryData(
      context.trpc.frenchpressBrew.getAll.queryOptions(),
    )
  },
  component: NewFrenchpressBrew,
})

function NewFrenchpressBrew() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: coffees } = useSuspenseQuery(trpc.coffee.getAll.queryOptions())
  const coffee = useSearchSelectResource(coffees)

  const { data: brews } = useSuspenseQuery(
    trpc.frenchpressBrew.getAll.queryOptions(),
  )

  const createMethod = useMutation(
    trpc.frenchpressMethod.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.frenchpressMethod.list.queryOptions(),
        )
      },
    }),
  )
  const { data: methods } = useSuspenseQuery(
    trpc.frenchpressMethod.list.queryOptions(),
  )
  // Methods are user-extensible: typing a new one adds it on the fly.
  const method = useSearchSelectResource(methods, (name) =>
    createMethod.mutateAsync({ name }),
  )

  const { data: grinders } = useSuspenseQuery(trpc.grinder.list.queryOptions())
  const grinder = useSearchSelectResource(grinders)

  // French press brews must be logged on a French Press-type device (enforced
  // again server-side in frenchpressBrew.create).
  const { data: brewingDevices } = useSuspenseQuery(
    trpc.brewingDevice.list.queryOptions(),
  )
  const frenchpressDevices = brewingDevices.filter(
    (device) => device.type.name === FRENCH_PRESS_DEVICE_TYPE,
  )
  const brewingDevice = useSearchSelectResource(frenchpressDevices)

  const createBrew = useMutation(
    trpc.frenchpressBrew.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.frenchpressBrew.getAll.queryOptions(),
        )
        navigate({ to: '/brews' })
      },
    }),
  )

  const defaultBrew: InsertFrenchpressBrew = {
    coffeeId: '',
    methodId: '',
    grinderId: '',
    brewingDeviceId: '',
    roastDate: null,
    dose: null,
    water: null,
    steepTime: null,
    waterTemp: null,
    grindSetting: null,
    notes: null,
  }

  const form = useAppForm({
    defaultValues: defaultBrew,
    validators: {
      onChange: insertFrenchpressBrewSchema,
    },
    onSubmit: ({ value }) => {
      createBrew.mutate(value)
    },
  })

  return (
    <Card className="flex flex-col items-center w-full max-w-2xl mx-auto p-4">
      <H1 className="text-start w-full max-w-md">Log French Press Brew</H1>
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
            // recent brew. The recipe (dose/water/steep time/temp/grind) is left
            // blank so it's entered fresh each brew.
            onChange: ({ value }) => {
              const latest = brews.find((b) => b.coffeeId === value)
              if (!latest) return
              form.setFieldValue('methodId', latest.methodId)
              form.setFieldValue('grinderId', latest.grinderId)
              form.setFieldValue('brewingDeviceId', latest.brewingDeviceId)
              form.setFieldValue('roastDate', latest.roastDate)
            },
          }}
        >
          {(field) => <field.SearchSelect label="Coffee" {...coffee} />}
        </form.AppField>
        <form.AppField name="methodId">
          {(field) => <field.SearchSelect label="Method" {...method} />}
        </form.AppField>
        <form.AppField name="grinderId">
          {(field) => <field.SearchSelect label="Grinder" {...grinder} />}
        </form.AppField>
        <form.AppField name="brewingDeviceId">
          {(field) => (
            <field.SearchSelect label="Brewing Device" {...brewingDevice} />
          )}
        </form.AppField>
        <form.AppField name="roastDate">
          {(field) => <field.DatePicker label="Roast Date" />}
        </form.AppField>
        <form.AppField name="dose">
          {(field) => (
            <field.TextField
              label="Dose (g)"
              placeholder="30.0"
              type="number"
              step="any"
              inputMode="decimal"
            />
          )}
        </form.AppField>
        <form.AppField name="water">
          {(field) => (
            <field.TextField
              label="Water (g)"
              placeholder="500"
              type="number"
              step="any"
              inputMode="decimal"
            />
          )}
        </form.AppField>
        <form.AppField name="steepTime">
          {(field) => (
            <field.TextField
              label="Steep Time (s)"
              placeholder="240"
              type="number"
            />
          )}
        </form.AppField>
        <form.AppField name="waterTemp">
          {(field) => (
            <field.TextField
              label="Water Temp (°C)"
              placeholder="95"
              type="number"
            />
          )}
        </form.AppField>
        <form.AppField name="grindSetting">
          {(field) => (
            <field.TextField label="Grind Setting" placeholder="e.g. 30" />
          )}
        </form.AppField>
        <form.AppField name="notes">
          {(field) => (
            <field.TextArea label="Notes" placeholder="Tasting notes..." />
          )}
        </form.AppField>
        <Button type="submit">
          Log
          <Plus />
        </Button>
      </form>
    </Card>
  )
}
