import {
  ESPRESSO_SHOT_PAGE_SIZE,
  encodeEspressoShotCursor,
} from '@coffee-companion/api/lib/espresso'
import { espressoShotPageInput } from '@/hooks/use-espresso-shot-pages'
import { makeCoffee } from './factories'
import type { makeRecentShot } from './factories'
import type { EspressoShotCursor } from '@coffee-companion/api/lib/espresso'
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { EspressoShotWithRelations } from '@/types'
import type { EspressoShotPageFilters } from '@/hooks/use-espresso-shot-pages'

type Shot = EspressoShotWithRelations
type ShotPage = {
  items: Array<Shot>
  total: number
  nextCursor: EspressoShotCursor | null
}
type Trpc = {
  espressoShot: {
    getRecent: {
      infiniteQueryKey: (input: {
        limit: number
        coffeeId?: string
        q?: string
        dialedIn?: boolean
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

// The Coffee list that holds the Coffees of these shots, with their roasters.
// A Coffee in several shots is built from the first of them.
export function coffeesFromShots(
  shots: Array<ReturnType<typeof makeRecentShot>>,
) {
  const byId = new Map<string, ReturnType<typeof makeCoffee>>()
  for (const shot of shots) {
    if (!byId.has(shot.coffeeId)) {
      byId.set(
        shot.coffeeId,
        makeCoffee({
          id: shot.coffeeId,
          name: shot.coffee.name,
          roaster: shot.coffee.roaster ?? null,
        }),
      )
    }
  }
  return [...byId.values()]
}

export function espressoShotFixtureId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

const ISO_MILLISECOND_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})\.(\d{3})Z$/

function cursorTimestampFromDate(createdAt: Date): string {
  const match = ISO_MILLISECOND_PATTERN.exec(createdAt.toISOString())
  if (!match) {
    throw new Error('createdAt is not a UTC millisecond timestamp')
  }
  return `${match[1]} ${match[2]}.${match[3]}000`
}

export function espressoShotCursor(shot: {
  createdAt: Date
  id: string
}): EspressoShotCursor {
  return encodeEspressoShotCursor({
    createdAt: cursorTimestampFromDate(shot.createdAt),
    id: shot.id,
  })
}

export function seedEspressoShotPage(
  queryClient: QueryClient,
  trpc: Trpc,
  items: Array<Shot>,
  total = items.length,
  cursor?: EspressoShotCursor | null,
  filters: EspressoShotPageFilters = {},
  nextCursor?: EspressoShotCursor | null,
) {
  const resolvedNextCursor =
    nextCursor !== undefined
      ? nextCursor
      : !cursor &&
          items.length === ESPRESSO_SHOT_PAGE_SIZE &&
          items.length < total
        ? espressoShotCursor(items[items.length - 1])
        : null
  const page = { items, total, nextCursor: resolvedNextCursor }
  const key = trpc.espressoShot.getRecent.infiniteQueryKey(
    espressoShotPageInput(filters),
  )
  queryClient.setQueryData(
    key,
    (current: InfiniteData<ShotPage, string | undefined> | undefined) => {
      // Replacing a page keeps the pages after it only while its cursor still
      // leads to them, as a real refetch would.
      const replaceAt = (
        data: InfiniteData<ShotPage, string | undefined>,
        index: number,
      ) => {
        const keepRest = data.pageParams[index + 1] === page.nextCursor
        const end = keepRest ? data.pages.length : index + 1
        const pages = data.pages.slice(0, end)
        pages[index] = page
        return { pages, pageParams: data.pageParams.slice(0, end) }
      }
      if (!cursor) {
        if (!current?.pages.length) {
          return { pages: [page], pageParams: [undefined] }
        }
        return replaceAt(current, 0)
      }
      const data = current ?? { pages: [], pageParams: [] }
      const index = data.pageParams.findIndex((param) => param === cursor)
      if (index >= 0) return replaceAt(data, index)
      // An append must continue the chain, as fetchNextPage would: a page
      // for a cursor the cached pages no longer end on is unreachable.
      const tail = data.pages.at(-1)
      if (tail && tail.nextCursor !== cursor) {
        throw new Error(
          `seedEspressoShotPage: cursor ${cursor} does not follow the cached pages`,
        )
      }
      return {
        pages: [...data.pages, page],
        pageParams: [...data.pageParams, cursor],
      }
    },
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
