import { insertGrinderSchema } from '@coffee-companion/api/db/zod'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import type { InsertGrinder } from '@coffee-companion/api/db/zod'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAppForm } from '@/hooks/form'
import { useTRPC } from '@/integrations/trpc/react'

export const Route = createFileRoute(
  '/_authenticated/equipment/grinders/$grinderId/edit',
)({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.grinder.getById.queryOptions(params.grinderId),
    )
  },
  component: EditGrinder,
})

function EditGrinder() {
  const { grinderId } = Route.useParams()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: grinder } = useSuspenseQuery(
    trpc.grinder.getById.queryOptions(grinderId),
  )

  const updateGrinder = useMutation(
    trpc.grinder.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.grinder.list.queryOptions())
        queryClient.invalidateQueries(
          trpc.grinder.getById.queryOptions(grinderId),
        )
        navigate({ to: '/equipment' })
      },
    }),
  )

  const defaultGrinder: InsertGrinder = {
    name: grinder.name,
    brand: grinder.brand,
  }

  const form = useAppForm({
    defaultValues: defaultGrinder,
    validators: {
      onChange: insertGrinderSchema,
    },
    onSubmit: ({ value }) => {
      updateGrinder.mutate({ ...value, id: grinderId })
    },
  })

  return (
    <Card className="flex flex-col items-center w-full max-w-2xl mx-auto p-4">
      <H1 className="text-start w-full max-w-md">Edit Grinder</H1>
      <form
        className="w-full max-w-md flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.AppField name="name">
          {(field) => (
            <field.TextField label="Name" placeholder="e.g. Niche Zero" />
          )}
        </form.AppField>
        <form.AppField name="brand">
          {(field) => (
            <field.TextField label="Brand" placeholder="e.g. Niche" />
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
