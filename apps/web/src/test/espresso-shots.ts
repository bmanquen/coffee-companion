import { ESPRESSO_SHOT_PAGE_SIZE } from '@coffee-companion/api/lib/espresso'
import type { QueryClient } from '@tanstack/react-query'
import type { EspressoShotWithRelations } from '@/types'

type Shot = EspressoShotWithRelations
type Trpc = {
  espressoShot: {
    getRecent: {
      queryKey: (input: {
        limit: number
        offset: number
      }) => ReadonlyArray<unknown>
    }
    getLatestUnsealed: {
      queryKey: (input: { coffeeId: string }) => ReadonlyArray<unknown>
    }
  }
}

export { ESPRESSO_SHOT_PAGE_SIZE }

export function seedEspressoShotPage(
  queryClient: QueryClient,
  trpc: Trpc,
  items: Array<Shot>,
  total = items.length,
  offset = 0,
) {
  queryClient.setQueryData(
    trpc.espressoShot.getRecent.queryKey({
      limit: ESPRESSO_SHOT_PAGE_SIZE,
      offset,
    }),
    { items, total },
  )
}

export function seedLatestUnsealed(
  queryClient: QueryClient,
  trpc: Trpc,
  coffeeId: string,
  shot: Shot | null,
) {
  queryClient.setQueryData(
    trpc.espressoShot.getLatestUnsealed.queryKey({ coffeeId }),
    shot,
  )
}
