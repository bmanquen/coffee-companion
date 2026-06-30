import { insertBrewingDeviceSchema } from '@coffee-companion/api/db/zod'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import type { InsertBrewingDevice } from '@coffee-companion/api/db/zod'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAppForm } from '@/hooks/form'
import { useSearchSelectResource } from '@/hooks/use-search-select-resource'
import { useTRPC } from '@/integrations/trpc/react'

export const Route = createFileRoute(
  '/_authenticated/equipment/brewing-devices/$deviceId/edit',
)({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.brewingDevice.getById.queryOptions(params.deviceId),
    )
    await context.queryClient.ensureQueryData(
      context.trpc.brewingDeviceType.list.queryOptions(),
    )
  },
  component: EditBrewingDevice,
})

function EditBrewingDevice() {
  const { deviceId } = Route.useParams()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: device } = useSuspenseQuery(
    trpc.brewingDevice.getById.queryOptions(deviceId),
  )

  const { data: types } = useSuspenseQuery(
    trpc.brewingDeviceType.list.queryOptions(),
  )
  const createType = useMutation(
    trpc.brewingDeviceType.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.brewingDeviceType.list.queryOptions(),
        )
      },
    }),
  )
  const type = useSearchSelectResource(types, (name) =>
    createType.mutateAsync({ name }),
  )

  const updateDevice = useMutation(
    trpc.brewingDevice.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.brewingDevice.list.queryOptions())
        queryClient.invalidateQueries(
          trpc.brewingDevice.getById.queryOptions(deviceId),
        )
        navigate({ to: '/equipment' })
      },
    }),
  )

  const defaultDevice: InsertBrewingDevice = {
    name: device.name,
    brand: device.brand,
    typeId: device.typeId,
  }

  const form = useAppForm({
    defaultValues: defaultDevice,
    validators: {
      onChange: insertBrewingDeviceSchema,
    },
    onSubmit: ({ value }) => {
      updateDevice.mutate({ ...value, id: deviceId })
    },
  })

  return (
    <Card className="flex flex-col items-center w-full max-w-2xl mx-auto p-4">
      <H1 className="text-start w-full max-w-md">Edit Brewing Device</H1>
      <form
        className="w-full max-w-md flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.AppField name="name">
          {(field) => (
            <field.TextField label="Name" placeholder="e.g. Linea Mini" />
          )}
        </form.AppField>
        <form.AppField name="brand">
          {(field) => (
            <field.TextField label="Brand" placeholder="e.g. La Marzocco" />
          )}
        </form.AppField>
        <form.AppField name="typeId">
          {(field) => <field.SearchSelect label="Type" {...type} />}
        </form.AppField>
        <Button type="submit">
          Save
          <Check />
        </Button>
      </form>
    </Card>
  )
}
