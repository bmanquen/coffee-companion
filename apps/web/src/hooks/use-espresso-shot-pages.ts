import {
  ESPRESSO_SHOT_PAGE_SIZE,
  ESPRESSO_SHOT_Q_MAX,
} from '@coffee-companion/api/lib/espresso'
import {
  keepPreviousData,
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect, useMemo } from 'react'
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

type CursorPage = { nextCursor: string | null }

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
      placeholderData: keepPreviousData,
      staleTime: ESPRESSO_SHOT_STALE_TIME_MS,
    },
  )
}

function linkedShotPages<TPage extends CursorPage>(
  data: { pages: Array<TPage>; pageParams: Array<unknown> } | undefined,
): Array<TPage> {
  if (!data?.pages.length) return []
  const linked = [data.pages[0]]
  for (let i = 1; i < data.pages.length; i++) {
    const previous = linked[linked.length - 1]
    if (previous.nextCursor == null) break
    if (data.pageParams[i] !== previous.nextCursor) break
    linked.push(data.pages[i])
  }
  return linked
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
  const hidingPrevious = query.isPlaceholderData && query.isFetching

  useEffect(() => {
    // Infinite refetch keeps stored pageParams. Extra pages that no longer
    // follow the first page's nextCursor belong to a different chain.
    if (query.isFetching) return
    const data = query.data
    if (!data || data.pages.length < 2) return
    const linked = linkedShotPages(data)
    if (linked.length === data.pages.length) return
    queryClient.setQueryData(options.queryKey, (current) => {
      if (!current || current.pages.length < 2) return current
      const nextLinked = linkedShotPages(current)
      if (nextLinked.length === current.pages.length) return current
      return {
        pages: nextLinked,
        pageParams: current.pageParams.slice(0, nextLinked.length),
      }
    })
  }, [options.queryKey, query.data, query.isFetching, queryClient])

  const linked = useMemo(() => linkedShotPages(query.data), [query.data])
  const items = useMemo(() => {
    if (hidingPrevious) return NO_SHOTS
    if (linked.length === 0) return NO_SHOTS
    return linked.flatMap((page) => page.items)
  }, [hidingPrevious, linked])

  const hasMore =
    !hidingPrevious && linked[linked.length - 1]?.nextCursor != null
  const loading = query.isPending || hidingPrevious
  const loadingMore = query.isFetchingNextPage
  const loadMoreError = query.isFetchNextPageError
    ? ESPRESSO_LOAD_MORE_FAILED
    : null
  const loadError =
    query.isError && !query.isFetchNextPageError ? ESPRESSO_LOAD_FAILED : null
  const stale = loadError != null && items.length > 0

  const loadMore = useCallback(() => {
    if (hidingPrevious || query.isFetchingNextPage || query.isRefetching) {
      return Promise.resolve()
    }
    const pages = linkedShotPages(query.data)
    if (pages.length === 0) return Promise.resolve()
    const last = pages[pages.length - 1]
    if (last.nextCursor == null) return Promise.resolve()
    if (query.data && pages.length < query.data.pages.length) {
      queryClient.setQueryData(options.queryKey, {
        pages,
        pageParams: query.data.pageParams.slice(0, pages.length),
      })
    }
    return query.fetchNextPage().then(() => undefined)
  }, [hidingPrevious, options.queryKey, query, queryClient])

  const retry = useCallback(() => query.refetch().then(() => undefined), [query])

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
