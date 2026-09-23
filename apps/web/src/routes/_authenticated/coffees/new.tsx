import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import type { CoffeeFormValues } from '@/components/coffees/coffee-form'
import { CoffeeOriginEditor } from '@/components/coffees/coffee-origin-editor'
import {
  coffeeFormSchema,
  coffeeMutationFields,
  emptyOrigin,
  originsForApi,
} from '@/components/coffees/coffee-form'
import { MutationErrorNotices } from '@/components/form/mutation-error-notices'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAppForm } from '@/hooks/form'
import { useSearchSelectResource } from '@/hooks/use-search-select-resource'
import { useTRPC } from '@/integrations/trpc/react'
import { track } from '@/lib/analytics'
import { submitFormMutation } from '@/lib/form-error'

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
        track('coffee_created')
        navigate({ to: '/coffees' })
      },
    }),
  )

  const defaultCoffee: CoffeeFormValues = {
    name: '',
    roasterId: '',
    roastLevelId: '',
    notes: null,
    isActive: false,
    origins: [{ ...emptyOrigin }],
  }

  const form = useAppForm({
    defaultValues: defaultCoffee,
    validators: {
      onChange: coffeeFormSchema,
    },
    onSubmit: async ({ value }) => {
      await submitFormMutation(
        form,
        createCoffee.mutateAsync,
        {
          ...value,
          origins: originsForApi(value.origins),
        },
        coffeeMutationFields,
      )
    },
  })

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
        <CoffeeOriginEditor
          form={form}
          countries={country}
          processes={coffeeProcess}
        />
        <form.AppField name="notes">
          {(field) => <field.TextArea label="Notes" placeholder="Notes..." />}
        </form.AppField>
        <MutationErrorNotices
          error={createCoffee.error}
          reset={createCoffee.reset}
          form={form}
          fieldByCode={coffeeMutationFields}
        />
        <Button type="submit" disabled={createCoffee.isPending}>
          Add
          <Plus />
        </Button>
      </form>
    </Card>
  )
}
