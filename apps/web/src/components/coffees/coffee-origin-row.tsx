import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { FieldLegend, FieldSet } from '@/components/ui/field'
import { useSearchSelectResource } from '@/hooks/use-search-select-resource'
import { useTRPC } from '@/integrations/trpc/react'

export function CoffeeOriginRow({
  label,
  countryId,
  canRemove,
  onRemove,
  renderCountry,
  renderRegion,
  renderProcess,
}: {
  label: string
  countryId: string
  canRemove: boolean
  onRemove: () => void
  renderCountry: (country: { disabled: boolean }) => ReactNode
  renderProcess: (process: { disabled: boolean }) => ReactNode
  renderRegion: (region: {
    options: Array<{ value: string; label: string }>
    onAddItem?: (
      name: string,
    ) => Promise<{ value: string; label: string } | null>
    disabled: boolean
  }) => ReactNode
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const countryIdRef = useRef(countryId)
  countryIdRef.current = countryId
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
  const region = useSearchSelectResource(regions ?? [])
  const pending = createRegion.isPending

  return (
    <FieldSet className="gap-2 rounded-lg border border-border bg-muted/50 p-3">
      <FieldLegend variant="label" className="mb-1">
        {label}
      </FieldLegend>
      {renderCountry({ disabled: pending })}
      {renderRegion({
        options: region.options,
        onAddItem: countryId
          ? async (name) => {
              const requestedCountryId = countryId
              const created = await createRegion.mutateAsync({
                name,
                countryId: requestedCountryId,
              })
              if (countryIdRef.current !== requestedCountryId) return null
              return { value: created.id, label: created.name }
            }
          : undefined,
        disabled: !countryId || pending,
      })}
      {renderProcess({ disabled: pending })}
      {canRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={onRemove}
        >
          Remove origin
        </Button>
      ) : null}
    </FieldSet>
  )
}
