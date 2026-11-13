import {
  ESPRESSO_SHOT_PAGE_SIZE,
  ESPRESSO_SHOT_Q_MAX,
} from '@coffee-companion/api/lib/espresso'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import type { InfiniteData } from '@tanstack/react-query'
import type { EspressoShotWithRelations } from '@/types'
import { useTRPC } from '@/integrations/trpc/react'

export { ESPRESSO_SHOT_PAGE_SIZE, ESPRESSO_SHOT_Q_MAX }

export const ESPRESSO_LOAD_MORE_FAILED =
  "We couldn't load more shots. Try again."

export const ESPRESSO_LOAD_FAILED = "We couldn't load your shots. Try again."

export const ESPRESSO_LOADING_SHOTS = 'Loading shots'

export const ESPRESSO_COFFEES_LOAD_FAILED =
  "We couldn't load your coffees. Try again."

export const ESPRESSO_SHOT_STALE_TIME_MS = 30_000

export const ESPRESSO_COFFEES_STALE_TIME_MS = ESPRESSO_SHOT_STALE_TIME_MS

export const ESPRESSO_SHOT_FILTER_DEBOUNCE_MS = 300

const NO_SHOTS: Array<EspressoShotWithRelations> = []

export type EspressoShotPageFilters = {
  coffeeId?: string
  q?: string
  dialedIn?: boolean
}

export function espressoShotPageInput(
  filters: EspressoShotPageFilters = {},
) {
  const input: {
    limit: number
    coffeeId?: string
    q?: string
    dialedIn?: boolean
  } = { limit: ESPRESSO_SHOT_PAGE_SIZE }
  if (filters.coffeeId) input.coffeeId = filters.coffeeId
  const q = filters.q?.trim()
  if (q) input.q = q.slice(0, ESPRESSO_SHOT_Q_MAX)
  if (filters.dialedIn) input.dialedIn = true
  return input
}

export function espressoShotInfiniteOptions(
  trpc: ReturnType<typeof useTRPC>,
  filters: EspressoShotPageFilters = {},
) {
  return trpc.espressoShot.getRecent.infiniteQueryOptions(
    espressoShotPageInput(filters),
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: ESPRESSO_SHOT_STALE_TIME_MS,
    },
  )
}

export function withoutShotFromInfinitePages<
  TShot extends { id: string },
  TPage extends { items: Array<TShot>; total: number },
>(
  data: InfiniteData<TPage, unknown> | undefined,
  shotId: string,
): InfiniteData<TPage, unknown> | undefined {
  if (!data) return data
  let removed = 0
  const pages = data.pages.map((page) => {
    const items = page.items.filter((shot) => shot.id !== shotId)
    removed += page.items.length - items.length
    return items.length === page.items.length ? page : { ...page, items }
  })
  if (removed === 0) return data
  return {
    ...data,
    pages: pages.map((page) => ({
      ...page,
      total: Math.max(0, page.total - removed),
    })),
  }
}

export function useEspressoShotPages(filters: EspressoShotPageFilters = {}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const options = espressoShotInfiniteOptions(trpc, filters)
  const query = useInfiniteQuery(options)

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? NO_SHOTS,
    [query.data],
  )

  const hasMore = query.hasNextPage
  const loading = query.isPending
  const loadingMore = query.isFetchingNextPage
  const loadMoreError = query.isFetchNextPageError
    ? ESPRESSO_LOAD_MORE_FAILED
    : null
  const loadError =
    query.isError && !query.isFetchNextPageError ? ESPRESSO_LOAD_FAILED : null
  const stale = loadError != null && items.length > 0

  const loadMore = useCallback(() => {
    if (!query.hasNextPage || query.isFetchingNextPage || query.isRefetching) {
      return Promise.resolve()
    }
    return query.fetchNextPage().then(() => undefined)
  }, [query])

  const retry = useCallback(
    () => query.refetch().then(() => undefined),
    [query],
  )

  const removeShot = useCallback(
    (shotId: string) => {
      queryClient.setQueriesData(
        trpc.espressoShot.getRecent.infiniteQueryFilter(),
        (data) =>
          withoutShotFromInfinitePages(
            data as
              | InfiniteData<
                  { items: Array<{ id: string }>; total: number },
                  unknown
                >
              | undefined,
            shotId,
          ),
      )
    },
    [queryClient, trpc],
  )

  return {
    items,
    hasMore,
    loadingMore,
    loadMore,
    loadMoreError,
    loading,
    loadError,
    stale,
    retry,
    removeShot,
  }
}
