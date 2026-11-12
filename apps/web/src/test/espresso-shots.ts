import { ESPRESSO_SHOT_PAGE_SIZE } from '@coffee-companion/api/lib/espresso'
import type { QueryClient } from '@tanstack/react-query'
import type { EspressoShotWithRelations } from '@/types'
import type { EspressoShotPageFilters } from '@/hooks/use-espresso-shot-pages'
import { espressoShotPageInput } from '@/hooks/use-espresso-shot-pages'

type Shot = EspressoShotWithRelations
type Trpc = {
  espressoShot: {
    getRecent: {
      queryKey: (input: {
        limit: number
        offset: number
        coffeeId?: string
        q?: string
      }) => ReadonlyArray<unknown>
    }
    getLatestUnsealed: {
      queryKey: (input: { coffeeId: string }) => ReadonlyArray<unknown>
    }
  }
  coffee: {
    getAll: {
      queryKey: () => ReadonlyArray<unknown>
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
  filters: EspressoShotPageFilters = {},
) {
  queryClient.setQueryData(
    trpc.espressoShot.getRecent.queryKey(
      espressoShotPageInput(offset, filters),
    ),
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

export function seedCoffees(
  queryClient: QueryClient,
  trpc: Trpc,
  coffees: Array<unknown> = [],
) {
  queryClient.setQueryData(trpc.coffee.getAll.queryKey(), coffees)
}
