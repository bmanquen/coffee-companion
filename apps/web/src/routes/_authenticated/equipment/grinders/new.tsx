import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAppForm } from '@/hooks/form'
import { useTRPC } from '@/integrations/trpc/react'
import type { InsertGrinder } from '@coffee-companion/api/db/zod'
import { insertGrinderSchema } from '@coffee-companion/api/db/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'

export const Route = createFileRoute('/_authenticated/equipment/grinders/new')({
  component: NewGrinder,
})

function NewGrinder() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const createGrinder = useMutation(
    trpc.grinder.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.grinder.list.queryOptions())
        navigate({ to: '/equipment' })
      },
    }),
  )

  const defaultGrinder: InsertGrinder = {
    name: '',
    brand: '',
  }

  const form = useAppForm({
    defaultValues: defaultGrinder,
    validators: {
      onChange: insertGrinderSchema,
    },
    onSubmit: ({ value }) => {
      createGrinder.mutate(value)
    },
  })

  return (
    <Card className="flex flex-col items-center w-full max-w-2xl mx-auto p-4">
      <H1 className="text-start w-full max-w-md">Add Grinder</H1>
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
          Add
          <Plus />
        </Button>
      </form>
    </Card>
  )
}
