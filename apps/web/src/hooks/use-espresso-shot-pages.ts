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

export type EspressoShotPageFilters = {
  coffeeId?: string
  q?: string
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
  } = { limit: ESPRESSO_SHOT_PAGE_SIZE }
  if (cursor) input.cursor = cursor
  if (filters.coffeeId) input.coffeeId = filters.coffeeId
  const q = filters.q?.trim()
  if (q) input.q = q.slice(0, ESPRESSO_SHOT_Q_MAX)
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
    staleTime: Infinity,
  })
  const [extra, setExtra] = useState<Array<EspressoShotWithRelations>>([])
  const [extraCursor, setExtraCursor] = useState<EspressoShotCursor | null>(
    null,
  )
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const loadMoreSeq = useRef(0)
  const generation = first.dataUpdatedAt
  const filterKey = `${filters.coffeeId ?? ''}\0${filters.q?.trim() ?? ''}`

  useEffect(() => {
    loadMoreSeq.current += 1
    setExtra([])
    setExtraCursor(null)
    setLoadMoreError(null)
    setLoadingMore(false)
  }, [generation, filterKey])

  const pageItems = first.data?.items ?? []
  const items = useMemo(() => {
    if (first.isPlaceholderData) return pageItems
    return [...pageItems, ...extra]
  }, [extra, first.isPlaceholderData, pageItems])
  const nextCursor = first.isPlaceholderData
    ? null
    : extra.length > 0
      ? extraCursor
      : (first.data?.nextCursor ?? null)
  const hasMore = nextCursor != null
  const loading =
    first.isPending && pageItems.length === 0 && extra.length === 0
  const loadError =
    first.isError && pageItems.length === 0 && extra.length === 0
      ? ESPRESSO_LOAD_FAILED
      : null

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
        staleTime: Infinity,
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
  }, [filters, hasMore, loadingMore, nextCursor, queryClient, trpc])

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
    retry,
  }
}
