import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type { BrewingMethod } from '@coffee-companion/api/lib/dialed-in-brew'
import { useTRPC } from '@/integrations/trpc/react'

export function invalidateDeviceDialedInQueries(
  queryClient: QueryClient,
  trpc: ReturnType<typeof useTRPC>,
) {
  queryClient.invalidateQueries(trpc.dialedInBrew.list.queryOptions())
  queryClient.invalidateQueries(trpc.dialedInBrew.get.queryFilter())
}

export function useDeviceDialedIn(brewingMethod: BrewingMethod) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { data: mappings = [] } = useQuery({
    ...trpc.dialedInBrew.list.queryOptions(),
    placeholderData: [],
    // Seeded caches (tests, the brews loader) stay put; set() invalidates.
    staleTime: Infinity,
  })
  const setMapping = useMutation(
    trpc.dialedInBrew.set.mutationOptions({
      onSuccess: () => {
        invalidateDeviceDialedInQueries(queryClient, trpc)
      },
    }),
  )

  const isDialedIn = (brewId: string, brewingDeviceId: string) =>
    mappings.some(
      (row) =>
        row.brewId === brewId &&
        row.brewingDeviceId === brewingDeviceId &&
        row.brewingMethod === brewingMethod,
    )

  const toggle = (brew: { id: string; brewingDeviceId: string | null }) => {
    if (!brew.brewingDeviceId) return
    const dialedIn = isDialedIn(brew.id, brew.brewingDeviceId)
    setMapping.mutate({
      brewingMethod,
      brewingDeviceId: brew.brewingDeviceId,
      brewId: dialedIn ? null : brew.id,
    })
  }

  return { isDialedIn, toggle }
}
