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

export const ESPRESSO_LOAD_FAILED = "We couldn't load your shots. Try again."

export const ESPRESSO_LOADING_SHOTS = 'Loading shots'

export const ESPRESSO_COFFEES_LOAD_FAILED =
  "We couldn't load your coffees. Try again."

// Extra pages are only read through loadMore's fetchQuery, so this window
// expires a cached cursor page without an observer refetching it on its own.
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

export function useEspressoShotPages(filters: EspressoShotPageFilters = {}) {
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
  const firstPageFetch = useRef(false)
  const extraBoundTo = useRef<EspressoShotCursor | undefined>(undefined)
  const extraRef = useRef(extra)
  extraRef.current = extra
  const loadingMoreRef = useRef(loadingMore)
  loadingMoreRef.current = loadingMore
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const prevFirstUpdatedAt = useRef(0)
  const filterKey = `${filters.coffeeId ?? ''}\0${filters.q?.trim() ?? ''}\0${filters.dialedIn ? '1' : ''}`

  const dropExtraPages = useCallback(() => {
    loadMoreSeq.current += 1
    extraBoundTo.current = undefined
    setExtra([])
    setExtraCursor(undefined)
    setLoadMoreError(null)
    setLoadingMore(false)
  }, [])

  // Extra pages are a local copy of cursor fetches. A filter change, a first
  // page whose next-page cursor moved, or a first page that now has no next
  // page is a new listing. A same-boundary refetch keeps the extra rows but
  // reloads them so fields such as isDialedIn are not left stale.
  useEffect(() => {
    dropExtraPages()
  }, [dropExtraPages, filterKey])

  const reloadExtraPages = useCallback(
    async (boundary: EspressoShotCursor) => {
      if (loadingMoreRef.current) return
      const held = extraRef.current
      if (held.length === 0) return
      const seq = loadMoreSeq.current
      let cursor: EspressoShotCursor | null = boundary
      const items: Array<EspressoShotWithRelations> = []
      try {
        while (cursor && items.length < held.length) {
          const requestCursor: EspressoShotCursor = cursor
          const page = await queryClient.fetchQuery({
            ...trpc.espressoShot.getRecent.queryOptions(
              espressoShotPageInput(requestCursor, filtersRef.current),
            ),
            // Extra cache can still look fresh inside ESPRESSO_SHOT_STALE_TIME_MS.
            staleTime: 0,
          })
          if (seq !== loadMoreSeq.current) return
          items.push(...page.items)
          cursor = page.nextCursor
        }
        if (seq !== loadMoreSeq.current) return
        setExtra(items)
        setExtraCursor(cursor)
      } catch {
        if (seq !== loadMoreSeq.current) return
      }
    },
    [queryClient, trpc],
  )

  useEffect(() => {
    if (first.isFetching) {
      firstPageFetch.current = true
      return
    }
    if (firstPageFetch.current && first.isSuccess) {
      firstPageFetch.current = false
      const boundary = first.data.nextCursor ?? null
      if (
        extraBoundTo.current === undefined ||
        extraBoundTo.current !== boundary
      ) {
        dropExtraPages()
      }
      return
    }
    firstPageFetch.current = false
  }, [dropExtraPages, first.data?.nextCursor, first.isFetching, first.isSuccess])

  useEffect(() => {
    const prev = prevFirstUpdatedAt.current
    prevFirstUpdatedAt.current = first.dataUpdatedAt
    if (prev === 0 || prev === first.dataUpdatedAt) return
    if (!first.isSuccess || first.isPlaceholderData) return
    const boundary = first.data.nextCursor ?? null
    if (boundary == null || extraBoundTo.current !== boundary) return
    void reloadExtraPages(boundary)
  }, [
    first.data?.nextCursor,
    first.dataUpdatedAt,
    first.isPlaceholderData,
    first.isSuccess,
    reloadExtraPages,
  ])

  useEffect(() => {
    if (first.isPlaceholderData) return
    if (first.data && first.data.nextCursor == null) dropExtraPages()
  }, [dropExtraPages, first.data, first.isPlaceholderData])

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
    const requested = nextCursor
    // Bind before the fetch so a same-cursor first-page refetch that
    // finishes first cannot treat this load as unbound and cancel it.
    if (extraBoundTo.current === undefined) extraBoundTo.current = requested
    const seq = ++loadMoreSeq.current
    setLoadingMore(true)
    setLoadMoreError(null)
    try {
      const page = await queryClient.fetchQuery({
        ...trpc.espressoShot.getRecent.queryOptions(
          espressoShotPageInput(requested, filters),
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

  const retry = useCallback(() => first.refetch(), [first])

  const removeShot = useCallback((shotId: string) => {
    setExtra((current) => current.filter((shot) => shot.id !== shotId))
  }, [])

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
