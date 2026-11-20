import { useCallback, useMemo, useState } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiErrorMessage } from '../api-error'
import {
  ERROR_LOAD_FAILED,
  ERROR_LOAD_MORE_FAILED,
  ERROR_SAVE_FAILED,
} from './copy'
import type { InfiniteData } from '@tanstack/react-query'
import type { EspressoShotCursor } from '@coffee-companion/api/lib/espresso'
import type {
  EspressoApi,
  EspressoCatalog,
  ShotCreate,
  ShotPage,
} from './types'

export const ESPRESSO_EQUIPMENT_QUERY_KEY = 'espresso-equipment'
export const ESPRESSO_SHOTS_QUERY_KEY = 'espresso-shots'
// Keyed by user, then Coffee, so a save can drop every prefill of its user.
const ESPRESSO_PREFILL_QUERY_KEY = 'espresso-prefill'

export function useEspressoCatalog(api: EspressoApi, userId: string) {
  const queryClient = useQueryClient()
  const [saveError, setSaveError] = useState<string | null>(null)

  const equipment = useQuery({
    queryKey: [ESPRESSO_EQUIPMENT_QUERY_KEY, userId],
    queryFn: () => api.load(),
  })
  const shots = useInfiniteQuery({
    queryKey: [ESPRESSO_SHOTS_QUERY_KEY, userId],
    // Reading signal is also what tells TanStack a cancelled refresh must not
    // go on to its older pages.
    queryFn: ({ pageParam, signal }) => api.listShots(pageParam, signal),
    initialPageParam: undefined as EspressoShotCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  const items = useMemo(
    () => shots.data?.pages.flatMap((page) => page.items) ?? [],
    [shots.data],
  )

  const catalog: EspressoCatalog | null = equipment.data
    ? { ...equipment.data, shots: items }
    : null

  const loading =
    equipment.isPending ||
    (shots.isPending && items.length === 0) ||
    (shots.isFetching && items.length === 0 && !shots.isFetchingNextPage)

  const equipmentFailed = equipment.isError && !equipment.data
  const historyFailed = shots.isError && !shots.isFetchNextPageError
  const loadError = equipmentFailed
    ? apiErrorMessage(equipment.error, ERROR_LOAD_FAILED)
    : historyFailed
      ? apiErrorMessage(shots.error, ERROR_LOAD_FAILED)
      : null

  const loadMoreError = shots.isFetchNextPageError
    ? apiErrorMessage(shots.error, ERROR_LOAD_MORE_FAILED)
    : null

  // Each failed request retries on its own, so a failed history read can be
  // retried while equipment is still loading, and the reverse.
  const retrying =
    (equipmentFailed && equipment.isFetching) ||
    (historyFailed && shots.isRefetching)

  const reload = useCallback(() => {
    if (retrying) return
    if (equipmentFailed) void equipment.refetch()
    if (historyFailed) void shots.refetch()
  }, [equipment, equipmentFailed, historyFailed, retrying, shots])

  const loadMore = useCallback(() => {
    // After a failed refresh the cached pages are stale; paging on from them
    // would hide its Retry. A failed next page keeps its own footer retry.
    if (
      shots.isFetchingNextPage ||
      shots.isRefetching ||
      shots.isRefetchError ||
      !shots.hasNextPage
    ) {
      return
    }
    void shots.fetchNextPage({ cancelRefetch: false })
  }, [shots])

  const createShot = useMutation({
    mutationFn: (input: ShotCreate) => api.create(input),
  })

  const save = useCallback(
    (
      input: ShotCreate,
      onSuccess?: () => void,
      onError?: (error: unknown) => void,
    ) => {
      if (createShot.isPending) return
      setSaveError(null)
      createShot.mutate(input, {
        onSuccess: () => {
          // fetchQuery would otherwise hand the next form a prefill read before this shot
          queryClient.removeQueries({
            queryKey: [ESPRESSO_PREFILL_QUERY_KEY, userId],
          })
          onSuccess?.()
          const shotsFilter = { queryKey: [ESPRESSO_SHOTS_QUERY_KEY, userId] }
          // With no cached page, invalidate would reuse a read started before this save.
          void queryClient.cancelQueries(shotsFilter).then(() => {
            // Only the first page is read again, so the saved shot shows
            // without waiting on every older page, or failing with one; its
            // fresh cursor pages on from there.
            queryClient.setQueryData<
              InfiniteData<ShotPage, EspressoShotCursor | undefined>
            >(shotsFilter.queryKey, (data) =>
              data && data.pages.length > 1
                ? {
                    pages: data.pages.slice(0, 1),
                    pageParams: data.pageParams.slice(0, 1),
                  }
                : data,
            )
            return queryClient.invalidateQueries(shotsFilter)
          })
        },
        onError: (error) => {
          // The save may have committed, so a lookup begun before it is stale.
          queryClient.removeQueries({
            queryKey: [ESPRESSO_PREFILL_QUERY_KEY, userId],
          })
          setSaveError(apiErrorMessage(error, ERROR_SAVE_FAILED))
          onError?.(error)
        },
      })
    },
    [createShot, queryClient, userId],
  )

  const loadPrefill = useCallback(
    (coffeeId: string) =>
      queryClient.fetchQuery({
        queryKey: [ESPRESSO_PREFILL_QUERY_KEY, userId, coffeeId],
        queryFn: () => api.loadPrefill(coffeeId),
        staleTime: 0,
      }),
    [api, queryClient, userId],
  )

  const clearSaveError = useCallback(() => {
    setSaveError(null)
  }, [])

  return {
    catalog,
    // History stays readable when only the equipment request fails.
    shots: shots.data ? items : null,
    // Not after a failed refresh: loadMore waits for the history Retry then.
    hasMore: shots.hasNextPage && !shots.isRefetchError,
    refreshing: shots.isRefetching && !shots.isFetchingNextPage,
    loading,
    loadingMore: shots.isFetchingNextPage,
    loadMoreError,
    loadError,
    retrying,
    busy: createShot.isPending,
    saveError,
    reload,
    loadMore,
    loadPrefill,
    save,
    clearSaveError,
  }
}
