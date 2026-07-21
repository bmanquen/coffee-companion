import { insertAeropressBrewSchema } from '@coffee-companion/api/db/zod'
import { AEROPRESS_DEVICE_TYPE } from '@coffee-companion/api/lib/aeropress'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import type { InsertAeropressBrew } from '@coffee-companion/api/db/zod'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAppForm } from '@/hooks/form'
import { useBrewingDeviceSelect } from '@/hooks/use-brewing-device-select'
import { useSearchSelectResource } from '@/hooks/use-search-select-resource'
import { useTRPC } from '@/integrations/trpc/react'

export const Route = createFileRoute('/_authenticated/aeropress/$brewId/edit')({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.aeropressBrew.getById.queryOptions(params.brewId),
    )
    await context.queryClient.ensureQueryData(
      context.trpc.coffee.getAll.queryOptions(),
    )
    await context.queryClient.ensureQueryData(
      context.trpc.aeropressMethod.list.queryOptions(),
    )
    await context.queryClient.ensureQueryData(
      context.trpc.grinder.list.queryOptions(),
    )
    await context.queryClient.ensureQueryData(
      context.trpc.brewingDevice.list.queryOptions(),
    )
  },
  component: EditAeropressBrew,
})

function EditAeropressBrew() {
  const { brewId } = Route.useParams()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: brew } = useSuspenseQuery(
    trpc.aeropressBrew.getById.queryOptions(brewId),
  )

  const { data: coffees } = useSuspenseQuery(trpc.coffee.getAll.queryOptions())
  const coffee = useSearchSelectResource(coffees)

  const createMethod = useMutation(
    trpc.aeropressMethod.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.aeropressMethod.list.queryOptions())
      },
    }),
  )
  const { data: methods } = useSuspenseQuery(
    trpc.aeropressMethod.list.queryOptions(),
  )
  const method = useSearchSelectResource(methods, (name) =>
    createMethod.mutateAsync({ name }),
  )

  const { data: grinders } = useSuspenseQuery(trpc.grinder.list.queryOptions())
  const grinder = useSearchSelectResource(grinders)

  // AeroPress brews must be logged on an AeroPress-type device (enforced again
  // server-side in aeropressBrew.update).
  const brewingDevice = useBrewingDeviceSelect(AEROPRESS_DEVICE_TYPE)

  const updateBrew = useMutation(
    trpc.aeropressBrew.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.aeropressBrew.getAll.queryOptions())
        queryClient.invalidateQueries(
          trpc.aeropressBrew.getById.queryOptions(brewId),
        )
        navigate({ to: '/brews' })
      },
    }),
  )

  const defaultBrew: InsertAeropressBrew = {
    coffeeId: brew.coffeeId,
    methodId: brew.methodId,
    grinderId: brew.grinderId,
    brewingDeviceId: brew.brewingDeviceId,
    roastDate: brew.roastDate,
    dose: brew.dose,
    water: brew.water,
    steepTime: brew.steepTime,
    grindSetting: brew.grindSetting,
    notes: brew.notes,
  }

  const form = useAppForm({
    defaultValues: defaultBrew,
    validators: {
      onChange: insertAeropressBrewSchema,
    },
    onSubmit: ({ value }) => {
      updateBrew.mutate({ ...value, id: brewId })
    },
  })

  return (
    <Card className="flex flex-col items-center w-full max-w-2xl mx-auto p-4">
      <H1 className="text-start w-full max-w-md">Edit AeroPress Brew</H1>
      <form
        className="w-full max-w-md flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.AppField name="coffeeId">
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
              placeholder="15.0"
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
              placeholder="220"
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
              placeholder="90"
              type="number"
            />
          )}
        </form.AppField>
        <form.AppField name="grindSetting">
          {(field) => (
            <field.TextField label="Grind Setting" placeholder="e.g. 18" />
          )}
        </form.AppField>
        <form.AppField name="notes">
          {(field) => (
            <field.TextArea label="Notes" placeholder="Tasting notes..." />
          )}
        </form.AppField>
        <Button type="submit">
          Save
          <Check />
        </Button>
      </form>
    </Card>
  )
}
