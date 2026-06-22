import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAppForm } from '@/hooks/form'
import { useSearchSelectResource } from '@/hooks/use-search-select-resource'
import { useTRPC } from '@/integrations/trpc/react'
import {
  insertEspressoShotSchema,
  type InsertEspressoShot,
} from '@coffee-companion/api/db/zod'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'

export const Route = createFileRoute('/_authenticated/espresso/new')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.coffee.getAll.queryOptions(),
    )
    await context.queryClient.ensureQueryData(
      context.trpc.grinder.list.queryOptions(),
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
    <Card className="flex flex-col items-center w-3/4 h-dvh mx-auto">
      <H1 className="text-start w-1/2">Log Espresso Shot</H1>
      <form
        className="w-1/2 flex flex-col gap-2"
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
