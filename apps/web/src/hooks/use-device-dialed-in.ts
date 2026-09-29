import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { BrewingMethod } from '@coffee-companion/api/lib/dialed-in-brew'
import type { QueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/integrations/trpc/react'
import { track } from '@/lib/analytics'

export function invalidateDeviceDialedInQueries(
  queryClient: QueryClient,
  trpc: ReturnType<typeof useTRPC>,
) {
  queryClient.invalidateQueries(trpc.dialedInBrew.list.queryOptions())
  queryClient.invalidateQueries(trpc.dialedInBrew.get.queryFilter())
  queryClient.invalidateQueries(trpc.coffee.getAll.queryOptions())
}

function invalidateMethodFeed(
  queryClient: QueryClient,
  trpc: ReturnType<typeof useTRPC>,
  brewingMethod: BrewingMethod,
) {
  switch (brewingMethod) {
    case 'espresso':
      queryClient.invalidateQueries(trpc.espressoShot.getAll.queryFilter())
      queryClient.invalidateQueries(trpc.espressoShot.getRecent.queryFilter())
      queryClient.invalidateQueries(trpc.espressoShot.getDialedIn.queryFilter())
      return
    case 'aeropress':
      queryClient.invalidateQueries(trpc.aeropressBrew.getAll.queryFilter())
      queryClient.invalidateQueries(trpc.aeropressBrew.getRecent.queryFilter())
      queryClient.invalidateQueries(trpc.aeropressBrew.getDialedIn.queryFilter())
      return
    case 'pourover':
      queryClient.invalidateQueries(trpc.pouroverBrew.getAll.queryFilter())
      queryClient.invalidateQueries(trpc.pouroverBrew.getRecent.queryFilter())
      queryClient.invalidateQueries(trpc.pouroverBrew.getDialedIn.queryFilter())
      return
    case 'frenchpress':
      queryClient.invalidateQueries(trpc.frenchpressBrew.getAll.queryFilter())
      queryClient.invalidateQueries(trpc.frenchpressBrew.getRecent.queryFilter())
      queryClient.invalidateQueries(trpc.frenchpressBrew.getDialedIn.queryFilter())
      return
    case 'coldBrew':
      queryClient.invalidateQueries(trpc.coldBrewBrew.getAll.queryFilter())
      queryClient.invalidateQueries(trpc.coldBrewBrew.getRecent.queryFilter())
      queryClient.invalidateQueries(trpc.coldBrewBrew.getDialedIn.queryFilter())
  }
}

export function useDeviceDialedIn(brewingMethod: BrewingMethod) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const invalidate = () => {
    invalidateDeviceDialedInQueries(queryClient, trpc)
    invalidateMethodFeed(queryClient, trpc, brewingMethod)
  }

  const setMapping = useMutation(
    trpc.dialedInBrew.set.mutationOptions({
      onSuccess: () => {
        invalidate()
        track('brew_dialed_in', {
          method: brewingMethod === 'coldBrew' ? 'coldbrew' : brewingMethod,
        })
      },
    }),
  )
  const unsetMapping = useMutation(
    trpc.dialedInBrew.unset.mutationOptions({
      onSuccess: invalidate,
    }),
  )

  const toggle = (brew: {
    id: string
    brewingDeviceId: string | null
    isDialedIn: boolean
  }) => {
    if (!brew.brewingDeviceId) return
    if (brew.isDialedIn) {
      unsetMapping.mutate({ brewId: brew.id })
      return
    }
    setMapping.mutate({
      brewingMethod,
      brewingDeviceId: brew.brewingDeviceId,
      brewId: brew.id,
    })
  }

  return { toggle }
}
