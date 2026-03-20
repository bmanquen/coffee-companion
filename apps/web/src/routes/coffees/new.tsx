import { H1 } from '@/components/typography/h1'
import { Card } from '@/components/ui/card'
import { useAppForm } from '@/hooks/form'
import { useTRPC } from '@/integrations/trpc/react'
import {
  insertCoffeeSchema,
  type InsertCoffee,
} from '@coffee-companion/api/db/zod'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/coffees/new')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.country.list.queryOptions(),
    )
    await context.queryClient.ensureQueryData(
      context.trpc.roaster.list.queryOptions(),
    )
  },
  component: NewCoffeeComponent,
})

function NewCoffeeComponent() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const { data: roasters } = useSuspenseQuery(trpc.roaster.list.queryOptions())
  const createRoaster = useMutation(
    trpc.roaster.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.roaster.list.queryOptions())
      },
    }),
  )
  const roasterOptions = roasters.map((r) => ({ value: r.id, label: r.name }))

  const { data: roastLevels } = useSuspenseQuery(
    trpc.roastLevel.list.queryOptions(),
  )
  const createRoastLevel = useMutation(
    trpc.roaster.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.roastLevel.list.queryOptions())
      },
    }),
  )
  const roastLevelOptions = roastLevels.map((rl) => ({
    value: rl.id,
    label: rl.name,
  }))

  const { data: countries } = useSuspenseQuery(trpc.country.list.queryOptions())
  const createCountry = useMutation(
    trpc.country.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.country.list.queryOptions())
      },
    }),
  )
  const countryOptions = countries.map((c) => ({
    value: c.id,
    label: c.name,
  }))

  const defaultCoffee: InsertCoffee = {
    name: '',
    roasterId: null,
    roastLevelId: null,
    roastDate: null,
    countryId: null,
    regionId: null,
    processId: null,
    notes: null,
    isActive: false,
  }

  const form = useAppForm({
    defaultValues: defaultCoffee,
    validators: {
      onChange: insertCoffeeSchema,
    },
    onSubmit: ({ value }) => {
      console.log(value)
    },
  })

  return (
    <Card className="flex flex-col items-center w-3/4 h-dvh mx-auto">
      <H1 className="text-start w-1/2">Add Coffee</H1>
      <form
        className="w-1/2 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.AppField name="name">
          {(field) => <field.TextField label="Name" placeholder="Name" />}
        </form.AppField>
        <form.AppField name="roasterId">
          {(field) => (
            <field.SearchSelect
              label="Roaster"
              options={roasterOptions}
              onAddItem={async (name) => {
                const roaster = await createRoaster.mutateAsync({ name })
                return { value: roaster.id, label: roaster.name }
              }}
            />
          )}
        </form.AppField>
        <form.AppField name="roastLevelId">
          {(field) => (
            <field.SearchSelect
              label="Roast Level"
              options={roastLevelOptions}
              onAddItem={async (name) => {
                const roastLevel = await createRoastLevel.mutateAsync({ name })
                return { value: roastLevel.id, label: roastLevel.name }
              }}
            />
          )}
        </form.AppField>
        <form.AppField name="roastDate">
          {(field) => <field.DatePicker label="Roast Date" />}
        </form.AppField>
        <form.AppField name="countryId">
          {(field) => (
            <field.SearchSelect
              label="Country"
              options={countryOptions}
              onAddItem={async (name) => {
                const country = await createCountry.mutateAsync({ name })
                return { value: country.id, label: country.name }
              }}
            />
          )}
        </form.AppField>
      </form>
    </Card>
  )
}
