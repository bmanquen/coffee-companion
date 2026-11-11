import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ESPRESSO_SHOT_PAGE_SIZE } from '@coffee-companion/api/lib/espresso'
import type { EspressoShotWithRelations } from '@/types'
import { useTRPC } from '@/integrations/trpc/react'

export { ESPRESSO_SHOT_PAGE_SIZE }

export function espressoShotPageInput(offset = 0) {
  return { limit: ESPRESSO_SHOT_PAGE_SIZE, offset }
}

export function useEspressoShotPages() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const first = useSuspenseQuery(
    trpc.espressoShot.getRecent.queryOptions(espressoShotPageInput()),
  )
  const [extra, setExtra] = useState<Array<EspressoShotWithRelations>>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const generation = first.dataUpdatedAt

  useEffect(() => {
    setExtra([])
  }, [generation])

  const items = useMemo(
    () => [...first.data.items, ...extra],
    [first.data.items, extra],
  )
  const hasMore = items.length < first.data.total

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return
    const offset = items.length
    const startedAt = generation
    setLoadingMore(true)
    try {
      const page = await queryClient.fetchQuery({
        ...trpc.espressoShot.getRecent.queryOptions(
          espressoShotPageInput(offset),
        ),
        staleTime: Infinity,
      })
      if (startedAt !== generation) return
      setExtra((current) => [...current, ...page.items])
    } finally {
      setLoadingMore(false)
    }
  }, [generation, hasMore, items.length, loadingMore, queryClient, trpc])

  return { items, hasMore, loadingMore, loadMore }
}
