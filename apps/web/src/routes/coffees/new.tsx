import { H1 } from '@/components/typography/h1'
import { Card } from '@/components/ui/card'
import { useAppForm } from '@/hooks/form'
import { useTRPC } from '@/integrations/trpc/react'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/coffees/new')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.country.list.queryOptions(),
    )
  },
  component: NewCoffeeComponent,
})

function NewCoffeeComponent() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { data: countries } = useSuspenseQuery(trpc.country.list.queryOptions())
  const createCountry = useMutation(trpc.country.create.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.country.list.queryOptions())
    },
  }))

  const countryOptions = countries.map((c) => ({
    value: c.id,
    label: c.name,
  }))

  const form = useAppForm({
    defaultValues: {
      name: '',
      countryId: '',
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
