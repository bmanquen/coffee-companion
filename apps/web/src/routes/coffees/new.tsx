import { H1 } from '@/components/typography/h1'
import { Card } from '@/components/ui/card'
import { useAppForm } from '@/hooks/form'
import { useSearchSelectResource } from '@/hooks/use-search-select-resource'
import { useTRPC } from '@/integrations/trpc/react'
import {
  insertCoffeeSchema,
  type InsertCoffee,
} from '@coffee-companion/api/db/zod'
import { useStore } from '@tanstack/react-form'
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

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
      </form>
    </Card>
  )
}
