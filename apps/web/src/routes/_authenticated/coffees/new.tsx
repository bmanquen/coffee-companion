import { insertCoffeeSchema } from '@coffee-companion/api/db/zod'
import { useStore } from '@tanstack/react-form'
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import type { InsertCoffee } from '@coffee-companion/api/db/zod'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAppForm } from '@/hooks/form'
import { useSearchSelectResource } from '@/hooks/use-search-select-resource'
import { useTRPC } from '@/integrations/trpc/react'

export const Route = createFileRoute('/_authenticated/coffees/new')({
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
  const navigate = useNavigate()

  const { data: roasters } = useSuspenseQuery(trpc.roaster.list.queryOptions())
  const createRoaster = useMutation(
    trpc.roaster.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.roaster.list.queryOptions())
      },
    }),
  )
  const roaster = useSearchSelectResource(roasters, (name) =>
    createRoaster.mutateAsync({ name }),
  )

  const { data: roastLevels } = useSuspenseQuery(
    trpc.roastLevel.list.queryOptions(),
  )
  const createRoastLevel = useMutation(
    trpc.roastLevel.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.roastLevel.list.queryOptions())
      },
    }),
  )
  const roastLevel = useSearchSelectResource(roastLevels, (name) =>
    createRoastLevel.mutateAsync({ name }),
  )

  const { data: countries } = useSuspenseQuery(trpc.country.list.queryOptions())
  const createCountry = useMutation(
    trpc.country.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.country.list.queryOptions())
      },
    }),
  )
  const country = useSearchSelectResource(countries, (name) =>
    createCountry.mutateAsync({ name }),
  )

  const createCoffee = useMutation(
    trpc.coffee.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.coffee.getAll.queryOptions())
        navigate({ to: '/coffees' })
      },
    }),
  )

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
      createCoffee.mutate(value)
    },
  })

  const selectedCountryId = useStore(form.store, (s) => s.values.countryId)
  const { data: regions } = useQuery(
    trpc.region.getAll.queryOptions(selectedCountryId!, {
      enabled: !!selectedCountryId,
    }),
  )
  const createRegion = useMutation(
    trpc.region.create.mutationOptions({
      onSuccess: () => {
        if (selectedCountryId) {
          queryClient.invalidateQueries(
            trpc.region.getAll.queryOptions(selectedCountryId),
          )
        }
      },
    }),
  )
  const region = useSearchSelectResource(regions ?? [], (name) =>
    createRegion.mutateAsync({ name, countryId: selectedCountryId }),
  )

  const { data: coffeeProcesses } = useQuery(
    trpc.coffeeProcess.getAll.queryOptions(),
  )
  const createCoffeeProcess = useMutation(
    trpc.coffeeProcess.create.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries(trpc.coffeeProcess.getAll.queryOptions()),
    }),
  )
  const coffeeProcess = useSearchSelectResource(coffeeProcesses ?? [], (name) =>
    createCoffeeProcess.mutateAsync({ name }),
  )

  return (
    <Card className="flex flex-col items-center w-full max-w-2xl mx-auto p-4">
      <H1 className="text-start w-full max-w-md">Add Coffee</H1>
      <form
        className="w-full max-w-md flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              showLabel={false}
              label="Name"
              placeholder="Name"
            />
          )}
        </form.AppField>
        <form.AppField name="roasterId">
          {(field) => <field.SearchSelect label="Roaster" {...roaster} />}
        </form.AppField>
        <form.AppField name="roastLevelId">
          {(field) => (
            <field.SearchSelect label="Roast Level" {...roastLevel} />
          )}
        </form.AppField>
        <form.AppField name="roastDate">
          {(field) => <field.DatePicker label="Roast Date" />}
        </form.AppField>
        <form.AppField name="countryId">
          {(field) => <field.SearchSelect label="Country" {...country} />}
        </form.AppField>
        <form.AppField name="regionId">
          {(field) => (
            <field.SearchSelect
              label="Region"
              disabled={!selectedCountryId}
              {...region}
            />
          )}
        </form.AppField>
        <form.AppField name="processId">
          {(field) => <field.SearchSelect label="Process" {...coffeeProcess} />}
        </form.AppField>
        <form.AppField name="notes">
          {(field) => <field.TextArea label="Notes" placeholder="Notes..." />}
        </form.AppField>
        <Button type="submit">
          Add
          <Plus />
        </Button>
      </form>
    </Card>
  )
}
