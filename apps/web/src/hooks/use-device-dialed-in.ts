import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/integrations/trpc/react'
import type { BrewingMethod } from '@coffee-companion/api/lib/dialed-in-brew'

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
        queryClient.invalidateQueries(trpc.dialedInBrew.list.queryOptions())
        queryClient.invalidateQueries(trpc.dialedInBrew.get.queryFilter())
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
