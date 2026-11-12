import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ESPRESSO_SHOT_PAGE_SIZE,
  ESPRESSO_SHOT_Q_MAX,
} from '@coffee-companion/api/lib/espresso'
import type { EspressoShotCursor } from '@coffee-companion/api/lib/espresso'
import type { EspressoShotWithRelations } from '@/types'
import { useTRPC } from '@/integrations/trpc/react'

export { ESPRESSO_SHOT_PAGE_SIZE, ESPRESSO_SHOT_Q_MAX }

export const ESPRESSO_LOAD_MORE_FAILED =
  "We couldn't load more shots. Try again."

export const ESPRESSO_LOAD_FAILED =
  "We couldn't load your shots. Try again."

export const ESPRESSO_LOADING_SHOTS = 'Loading shots'

export const ESPRESSO_COFFEES_LOAD_FAILED =
  "We couldn't load your coffees. Try again."

// First-page refetch drops appended pages (generation follows dataUpdatedAt).
// Extra pages are only read through loadMore's fetchQuery, so this window
// expires a cached cursor page without an observer refetching it on its own.
export const ESPRESSO_SHOT_STALE_TIME_MS = 30_000

export const ESPRESSO_SHOT_FILTER_DEBOUNCE_MS = 300

const NO_SHOTS: Array<EspressoShotWithRelations> = []

export type EspressoShotPageFilters = {
  coffeeId?: string
  q?: string
  dialedIn?: boolean
}

export function espressoShotPageInput(
  cursor?: EspressoShotCursor | null,
  filters: EspressoShotPageFilters = {},
) {
  const input: {
    limit: number
    cursor?: EspressoShotCursor
    coffeeId?: string
    q?: string
    dialedIn?: boolean
  } = { limit: ESPRESSO_SHOT_PAGE_SIZE }
  if (cursor) input.cursor = cursor
  if (filters.coffeeId) input.coffeeId = filters.coffeeId
  const q = filters.q?.trim()
  if (q) input.q = q.slice(0, ESPRESSO_SHOT_Q_MAX)
  if (filters.dialedIn) input.dialedIn = true
  return input
}

export function useEspressoShotPages(
  filters: EspressoShotPageFilters = {},
) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const first = useQuery({
    ...trpc.espressoShot.getRecent.queryOptions(
      espressoShotPageInput(undefined, filters),
    ),
    placeholderData: keepPreviousData,
    staleTime: ESPRESSO_SHOT_STALE_TIME_MS,
  })
  const [extra, setExtra] = useState<Array<EspressoShotWithRelations>>([])
  const [extraCursor, setExtraCursor] = useState<
    EspressoShotCursor | null | undefined
  >(undefined)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const loadMoreSeq = useRef(0)
  const generation = first.dataUpdatedAt
  const filterKey = `${filters.coffeeId ?? ''}\0${filters.q?.trim() ?? ''}\0${filters.dialedIn ? '1' : ''}`

  useEffect(() => {
    loadMoreSeq.current += 1
    setExtra([])
    setExtraCursor(undefined)
    setLoadMoreError(null)
    setLoadingMore(false)
  }, [generation, filterKey])

  const pageItems = first.data?.items ?? NO_SHOTS
  const filterPending = first.isPlaceholderData && first.isFetching
  const items = useMemo(() => {
    if (first.isPlaceholderData) return NO_SHOTS
    return [...pageItems, ...extra]
  }, [extra, first.isPlaceholderData, pageItems])
  const nextCursor = first.isPlaceholderData
    ? null
    : extraCursor !== undefined
      ? extraCursor
      : (first.data?.nextCursor ?? null)
  const hasMore = nextCursor != null
  const loading =
    (first.isPending && pageItems.length === 0 && extra.length === 0) ||
    filterPending
  const loadError = first.isError ? ESPRESSO_LOAD_FAILED : null
  const stale = Boolean(first.isError && items.length > 0)

  const loadMore = useCallback(async () => {
    if (nextCursor == null || loadingMore) return
    const seq = ++loadMoreSeq.current
    setLoadingMore(true)
    setLoadMoreError(null)
    try {
      const page = await queryClient.fetchQuery({
        ...trpc.espressoShot.getRecent.queryOptions(
          espressoShotPageInput(nextCursor, filters),
        ),
        staleTime: ESPRESSO_SHOT_STALE_TIME_MS,
      })
      if (seq !== loadMoreSeq.current) return
      setExtra((current) => [...current, ...page.items])
      setExtraCursor(page.nextCursor)
    } catch {
      if (seq !== loadMoreSeq.current) return
      setLoadMoreError(ESPRESSO_LOAD_MORE_FAILED)
    } finally {
      if (seq === loadMoreSeq.current) setLoadingMore(false)
    }
  }, [filters, loadingMore, nextCursor, queryClient, trpc])

  const retry = useCallback(() => {
    void first.refetch()
  }, [first])

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
  }
}
