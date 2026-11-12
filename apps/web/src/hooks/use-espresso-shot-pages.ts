import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ESPRESSO_SHOT_PAGE_SIZE } from '@coffee-companion/api/lib/espresso'
import type { EspressoShotWithRelations } from '@/types'
import { useTRPC } from '@/integrations/trpc/react'

export { ESPRESSO_SHOT_PAGE_SIZE }

export const ESPRESSO_LOAD_MORE_FAILED =
  "We couldn't load more shots. Try again."

export type EspressoShotPageFilters = {
  coffeeId?: string
  q?: string
}

export function espressoShotPageInput(
  offset = 0,
  filters: EspressoShotPageFilters = {},
) {
  const input: {
    limit: number
    offset: number
    coffeeId?: string
    q?: string
  } = { limit: ESPRESSO_SHOT_PAGE_SIZE, offset }
  if (filters.coffeeId) input.coffeeId = filters.coffeeId
  const q = filters.q?.trim()
  if (q) input.q = q
  return input
}

export function useEspressoShotPages(
  filters: EspressoShotPageFilters = {},
) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const first = useQuery({
    ...trpc.espressoShot.getRecent.queryOptions(
      espressoShotPageInput(0, filters),
    ),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  })
  const [extra, setExtra] = useState<Array<EspressoShotWithRelations>>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const generation = first.dataUpdatedAt
  const generationRef = useRef(generation)
  generationRef.current = generation
  const filterKey = `${filters.coffeeId ?? ''}\0${filters.q?.trim() ?? ''}`

  useEffect(() => {
    setExtra([])
    setLoadMoreError(null)
  }, [generation, filterKey])

  const pageItems = first.data?.items ?? []
  const total = first.data?.total ?? 0
  const items = useMemo(() => {
    if (first.isPlaceholderData) return pageItems
    return [...pageItems, ...extra]
  }, [extra, first.isPlaceholderData, pageItems])
  const hasMore = !first.isPlaceholderData && items.length < total

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return
    const offset = items.length
    const startedAt = generationRef.current
    setLoadingMore(true)
    setLoadMoreError(null)
    try {
      const page = await queryClient.fetchQuery({
        ...trpc.espressoShot.getRecent.queryOptions(
          espressoShotPageInput(offset, filters),
        ),
        staleTime: Infinity,
      })
      if (startedAt !== generationRef.current) return
      setExtra((current) => [...current, ...page.items])
    } catch {
      if (startedAt !== generationRef.current) return
      setLoadMoreError(ESPRESSO_LOAD_MORE_FAILED)
    } finally {
      if (startedAt === generationRef.current) setLoadingMore(false)
    }
  }, [filters, hasMore, items.length, loadingMore, queryClient, trpc])

  return { items, hasMore, loadingMore, loadMore, loadMoreError }
}
