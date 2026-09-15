import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useSearchSelectResource } from '@/hooks/use-search-select-resource'
import { useTRPC } from '@/integrations/trpc/react'

export function CoffeeOriginRow({
  countryId,
  canRemove,
  onRemove,
  CountryField,
  renderRegion,
}: {
  countryId: string
  canRemove: boolean
  onRemove: () => void
  CountryField: ReactNode
  renderRegion: (region: {
    options: Array<{ value: string; label: string }>
    onAddItem?: (name: string) => Promise<{ value: string; label: string }>
    disabled: boolean
  }) => ReactNode
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { data: regions } = useQuery(
    trpc.region.getAll.queryOptions(countryId, {
      enabled: Boolean(countryId),
    }),
  )
  const createRegion = useMutation(
    trpc.region.create.mutationOptions({
      onSuccess: () => {
        if (countryId) {
          queryClient.invalidateQueries(
            trpc.region.getAll.queryOptions(countryId),
          )
        }
      },
    }),
  )
  const region = useSearchSelectResource(regions ?? [], (name) =>
    createRegion.mutateAsync({ name, countryId }),
  )

  return (
    <div className="flex flex-col gap-2">
      {CountryField}
      {renderRegion({ ...region, disabled: !countryId })}
      {canRemove ? (
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          Remove country
        </Button>
      ) : null}
    </div>
  )
}
