import {
  ESPRESSO_SHOT_PAGE_SIZE,
  ESPRESSO_SHOT_Q_MAX,
} from '@coffee-companion/api/lib/espresso'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTRPC } from '@/integrations/trpc/react'
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { EspressoShotWithRelations } from '@/types'

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

// After a shot write: invalidate leaves an in-flight read running, and its
// pre-write response would then land as fresh (and a new observer would join
// it), so cancel the shot reads first. Resolves once both are invalidated.
export async function refreshEspressoShotReads(
  queryClient: QueryClient,
  trpc: ReturnType<typeof useTRPC>,
) {
  const pages = trpc.espressoShot.getRecent.infiniteQueryFilter()
  const latest = trpc.espressoShot.getLatestUnsealed.queryFilter()
  await Promise.all([
    queryClient.cancelQueries(pages),
    queryClient.cancelQueries(latest),
  ])
  await Promise.all([
    queryClient.invalidateQueries(pages),
    queryClient.invalidateQueries(latest),
  ])
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
  // The filters on screen now, so a Load more can tell they changed under it.
  const filterKey = JSON.stringify(espressoShotPageInput(filters))
  const shownFilterKey = useRef(filterKey)
  useEffect(() => {
    shownFilterKey.current = filterKey
  }, [filterKey])

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? NO_SHOTS,
    [query.data],
  )

  const hasMore = query.hasNextPage
  const loading = query.isPending
  // loadMore waits out a refetch, so the pager must look busy during one,
  // including one paused offline.
  const loadingMore = query.fetchStatus !== 'idle'
  const loadMoreError = query.isFetchNextPageError
    ? ESPRESSO_LOAD_MORE_FAILED
    : null
  const loadError =
    query.isError && !query.isFetchNextPageError ? ESPRESSO_LOAD_FAILED : null
  const stale = loadError != null && items.length > 0

  // Resolves with the first appended shot's id, so a pager can move to it;
  // null when nothing was appended.
  const loadMore = useCallback(async (): Promise<string | null> => {
    if (!query.hasNextPage || query.fetchStatus !== 'idle') return null
    let loadedPages = query.data?.pages.length ?? 0
    // A successful append would clear the failed refresh and hide that the
    // cached pages are stale, so refresh them first.
    if (query.isError && !query.isFetchNextPageError) {
      const refreshed = await query.refetch()
      // fetchNextPage follows the filters on screen, so a coffee picked during
      // the refresh would get the page instead of the one clicked under.
      if (shownFilterKey.current !== filterKey) return null
      const lastPage = refreshed.data?.pages.at(-1)
      if (refreshed.isError || !lastPage?.nextCursor) return null
      loadedPages = refreshed.data?.pages.length ?? 0
    }
    const next = await query.fetchNextPage({ cancelRefetch: false })
    // A refetch started since the last render is joined, not appended to,
    // and its last page is one already shown.
    if (next.isError || (next.data?.pages.length ?? 0) <= loadedPages) {
      return null
    }
    return next.data?.pages.at(-1)?.items[0]?.id ?? null
  }, [query, filterKey])

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
