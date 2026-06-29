import {
  ESPRESSO_DEVICE_TYPE,
  insertEspressoShotSchema,
} from '@coffee-companion/api/db/zod'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import type { InsertEspressoShot } from '@coffee-companion/api/db/zod'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAppForm } from '@/hooks/form'
import { useSearchSelectResource } from '@/hooks/use-search-select-resource'
import { useTRPC } from '@/integrations/trpc/react'

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

function NewEspressoShot() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: coffees } = useSuspenseQuery(trpc.coffee.getAll.queryOptions())
  const coffee = useSearchSelectResource(coffees)

  const { data: grinders } = useSuspenseQuery(trpc.grinder.list.queryOptions())
  const grinder = useSearchSelectResource(grinders)

  // Espresso shots must be brewed on an Espresso-type device (enforced again
  // server-side in espressoShot.create).
  const { data: brewingDevices } = useSuspenseQuery(
    trpc.brewingDevice.list.queryOptions(),
  )
  const espressoDevices = brewingDevices.filter(
    (device) => device.type.name === ESPRESSO_DEVICE_TYPE,
  )
  const brewingDevice = useSearchSelectResource(espressoDevices)

  const createShot = useMutation(
    trpc.espressoShot.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.espressoShot.getAll.queryOptions())
        navigate({ to: '/espresso' })
      },
    }),
  )

  const defaultShot: InsertEspressoShot = {
    coffeeId: '',
    grinderId: '',
    brewingDeviceId: '',
    dose: null,
    yield: null,
    time: null,
    grindSetting: null,
    notes: null,
  }

  const form = useAppForm({
    defaultValues: defaultShot,
    validators: {
      onChange: insertEspressoShotSchema,
    },
    onSubmit: ({ value }) => {
      createShot.mutate(value)
    },
  })

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
        <form.AppField name="dose">
          {(field) => (
            <field.TextField
              label="Dose (g)"
              placeholder="18.0"
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
              placeholder="36.0"
              type="number"
              step="any"
              inputMode="decimal"
            />
          )}
        </form.AppField>
        <form.AppField name="time">
          {(field) => (
            <field.TextField label="Time (s)" placeholder="28" type="number" />
          )}
        </form.AppField>
        <form.AppField name="grindSetting">
          {(field) => (
            <field.TextField label="Grind Setting" placeholder="e.g. 2.5" />
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
