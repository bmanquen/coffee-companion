import { insertColdBrewBrewSchema } from '@coffee-companion/api/db/zod'
import { COLD_BREW_DEVICE_TYPE } from '@coffee-companion/api/lib/cold-brew'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import type { InsertColdBrewBrew } from '@coffee-companion/api/db/zod'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldContent, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAppForm } from '@/hooks/form'
import { useSearchSelectResource } from '@/hooks/use-search-select-resource'
import { useTRPC } from '@/integrations/trpc/react'

export const Route = createFileRoute('/_authenticated/cold-brew/new')({
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
    // Used to prefill the form from the coffee's most recent brew.
    await context.queryClient.ensureQueryData(
      context.trpc.coldBrewBrew.getAll.queryOptions(),
    )
  },
  component: NewColdBrewBrew,
})

function NewColdBrewBrew() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: coffees } = useSuspenseQuery(trpc.coffee.getAll.queryOptions())
  const coffee = useSearchSelectResource(coffees)

  const { data: brews } = useSuspenseQuery(
    trpc.coldBrewBrew.getAll.queryOptions(),
  )

  const { data: grinders } = useSuspenseQuery(trpc.grinder.list.queryOptions())
  const grinder = useSearchSelectResource(grinders)

  // Cold brews must be logged on a Cold Brew-type device (enforced again
  // server-side in coldBrewBrew.create).
  const { data: brewingDevices } = useSuspenseQuery(
    trpc.brewingDevice.list.queryOptions(),
  )
  const coldBrewDevices = brewingDevices.filter(
    (device) => device.type.name === COLD_BREW_DEVICE_TYPE,
  )
  const brewingDevice = useSearchSelectResource(coldBrewDevices)

  const createBrew = useMutation(
    trpc.coldBrewBrew.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.coldBrewBrew.getAll.queryOptions())
        navigate({ to: '/brews' })
      },
    }),
  )

  const defaultBrew: InsertColdBrewBrew = {
    coffeeId: '',
    grinderId: '',
    brewingDeviceId: '',
    roastDate: null,
    dose: null,
    water: null,
    steepTime: null,
    brewEnvironment: null,
    grindSetting: null,
    notes: null,
  }

  const form = useAppForm({
    defaultValues: defaultBrew,
    validators: {
      onChange: insertColdBrewBrewSchema,
    },
    onSubmit: ({ value }) => {
      createBrew.mutate(value)
    },
  })

  return (
    <Card className="flex flex-col items-center w-full max-w-2xl mx-auto p-4">
      <H1 className="text-start w-full max-w-md">Log Cold Brew</H1>
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
            // recent brew. The recipe (dose/water/steep time/environment/grind)
            // is left blank so it's entered fresh each brew. Cold brew is
            // methodless, so there is no method to carry forward.
            onChange: ({ value }) => {
              const latest = brews.find((b) => b.coffeeId === value)
              if (!latest) return
              form.setFieldValue('grinderId', latest.grinderId)
              form.setFieldValue('brewingDeviceId', latest.brewingDeviceId)
              form.setFieldValue('roastDate', latest.roastDate)
            },
          }}
        >
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
          {(field) => {
            // steepTime is stored as whole minutes; entered as hours + minutes.
            const total = field.state.value ?? null
            const hours = total === null ? '' : Math.floor(total / 60).toString()
            const minutes = total === null ? '' : (total % 60).toString()
            const setSteep = (h: string, m: string) => {
              if (h === '' && m === '') {
                field.handleChange(null)
                return
              }
              field.handleChange(
                (h === '' ? 0 : Number(h)) * 60 + (m === '' ? 0 : Number(m)),
              )
            }
            return (
              <Field>
                <FieldLabel htmlFor="steepTimeHours">Steep Time</FieldLabel>
                <FieldContent>
                  <div className="flex gap-2">
                    <Input
                      id="steepTimeHours"
                      aria-label="Steep Time (hours)"
                      type="number"
                      inputMode="numeric"
                      placeholder="18 hr"
                      value={hours}
                      onBlur={field.handleBlur}
                      onChange={(e) => setSteep(e.target.value, minutes)}
                    />
                    <Input
                      aria-label="Steep Time (minutes)"
                      type="number"
                      inputMode="numeric"
                      placeholder="0 min"
                      value={minutes}
                      onBlur={field.handleBlur}
                      onChange={(e) => setSteep(hours, e.target.value)}
                    />
                  </div>
                </FieldContent>
              </Field>
            )
          }}
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
          Log
          <Plus />
        </Button>
      </form>
    </Card>
  )
}
