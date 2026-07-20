import { insertColdBrewBrewSchema } from '@coffee-companion/api/db/zod'
import { COLD_BREW_DEVICE_TYPE } from '@coffee-companion/api/lib/cold-brew'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import type { InsertColdBrewBrew } from '@coffee-companion/api/db/zod'
import { SteepMinutesInput } from '@/components/form/steep-minutes-input'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAppForm } from '@/hooks/form'
import { useSearchSelectResource } from '@/hooks/use-search-select-resource'
import { useTRPC } from '@/integrations/trpc/react'

export const Route = createFileRoute('/_authenticated/cold-brew/$brewId/edit')({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.coldBrewBrew.getById.queryOptions(params.brewId),
    )
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
  component: EditColdBrewBrew,
})

function EditColdBrewBrew() {
  const { brewId } = Route.useParams()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: brew } = useSuspenseQuery(
    trpc.coldBrewBrew.getById.queryOptions(brewId),
  )

  const { data: coffees } = useSuspenseQuery(trpc.coffee.getAll.queryOptions())
  const coffee = useSearchSelectResource(coffees)

  const { data: grinders } = useSuspenseQuery(trpc.grinder.list.queryOptions())
  const grinder = useSearchSelectResource(grinders)

  // Cold brews must be logged on a Cold Brew-type device (enforced again
  // server-side in coldBrewBrew.update).
  const { data: brewingDevices } = useSuspenseQuery(
    trpc.brewingDevice.list.queryOptions(),
  )
  const coldBrewDevices = brewingDevices.filter(
    (device) => device.type.name === COLD_BREW_DEVICE_TYPE,
  )
  const brewingDevice = useSearchSelectResource(coldBrewDevices)

  const updateBrew = useMutation(
    trpc.coldBrewBrew.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.coldBrewBrew.getAll.queryOptions())
        queryClient.invalidateQueries(
          trpc.coldBrewBrew.getById.queryOptions(brewId),
        )
        navigate({ to: '/brews' })
      },
    }),
  )

  const defaultBrew: InsertColdBrewBrew = {
    coffeeId: brew.coffeeId,
    grinderId: brew.grinderId,
    brewingDeviceId: brew.brewingDeviceId,
    roastDate: brew.roastDate,
    dose: brew.dose,
    water: brew.water,
    steepTime: brew.steepTime,
    brewEnvironment: brew.brewEnvironment,
    grindSetting: brew.grindSetting,
    notes: brew.notes,
  }

  const form = useAppForm({
    defaultValues: defaultBrew,
    validators: {
      onChange: insertColdBrewBrewSchema,
    },
    onSubmit: ({ value }) => {
      updateBrew.mutate({ ...value, id: brewId })
    },
  })

  return (
    <Card className="flex flex-col items-center w-full max-w-2xl mx-auto p-4">
      <H1 className="text-start w-full max-w-md">Edit Cold Brew</H1>
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
              placeholder="50.0"
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
            <SteepMinutesInput
              value={field.state.value ?? null}
              onChange={(minutes) => field.handleChange(minutes)}
              onBlur={field.handleBlur}
            />
          )}
        </form.AppField>
        <form.AppField
          name="brewEnvironment"
          listeners={{
            // The SearchSelect emits '' when the current choice is toggled off;
            // treat that as "no environment" so the optional enum stays valid.
            onChange: ({ value }) => {
              if ((value as unknown as string) === '') {
                form.setFieldValue('brewEnvironment', null)
              }
            },
          }}
        >
          {(field) => (
            <field.SearchSelect
              label="Brew Environment"
              options={[
                { value: 'Counter', label: 'Counter' },
                { value: 'Fridge', label: 'Fridge' },
              ]}
            />
          )}
        </form.AppField>
        <form.AppField name="grindSetting">
          {(field) => (
            <field.TextField label="Grind Setting" placeholder="e.g. coarse" />
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
