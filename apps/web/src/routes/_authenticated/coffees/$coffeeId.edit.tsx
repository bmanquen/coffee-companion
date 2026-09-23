import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import type { CoffeeFormValues } from '@/components/coffees/coffee-form'
import { CoffeeOriginEditor } from '@/components/coffees/coffee-origin-editor'
import {
  coffeeFormSchema,
  coffeeMutationFields,
  formOriginsFromCoffee,
  originsForApi,
} from '@/components/coffees/coffee-form'
import { MutationErrorNotices } from '@/components/form/mutation-error-notices'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAppForm } from '@/hooks/form'
import { useSearchSelectResource } from '@/hooks/use-search-select-resource'
import { useTRPC } from '@/integrations/trpc/react'
import { submitFormMutation } from '@/lib/form-error'

export const Route = createFileRoute('/_authenticated/coffees/$coffeeId/edit')({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.coffee.getById.queryOptions(params.coffeeId),
    )
    await context.queryClient.ensureQueryData(
      context.trpc.country.list.queryOptions(),
    )
    await context.queryClient.ensureQueryData(
      context.trpc.roaster.list.queryOptions(),
    )
  },
  component: EditCoffeeComponent,
})

function EditCoffeeComponent() {
  const { coffeeId } = Route.useParams()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: coffee } = useSuspenseQuery(
    trpc.coffee.getById.queryOptions(coffeeId),
  )

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

  const updateCoffee = useMutation(
    trpc.coffee.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.coffee.getAll.queryOptions())
        queryClient.invalidateQueries(
          trpc.coffee.getById.queryOptions(coffeeId),
        )
        navigate({ to: '/coffees' })
      },
    }),
  )

  const defaultCoffee: CoffeeFormValues = {
    name: coffee.name,
    roasterId: coffee.roasterId ?? '',
    roastLevelId: coffee.roastLevelId ?? '',
    notes: coffee.notes,
    isActive: coffee.isActive,
    origins: formOriginsFromCoffee(coffee.origins),
  }

  const form = useAppForm({
    defaultValues: defaultCoffee,
    validators: {
      onChange: coffeeFormSchema,
    },
    onSubmit: async ({ value }) => {
      await submitFormMutation(
        form,
        updateCoffee.mutateAsync,
        {
          ...value,
          id: coffeeId,
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
      <H1 className="text-start w-full max-w-md">Edit Coffee</H1>
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
          error={updateCoffee.error}
          reset={updateCoffee.reset}
          form={form}
          fieldByCode={coffeeMutationFields}
        />
        <Button type="submit" disabled={updateCoffee.isPending}>
          Save
          <Check />
        </Button>
      </form>
    </Card>
  )
}
