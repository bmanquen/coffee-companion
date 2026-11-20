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
  const shotsOptions = useMemo(
    () => ({
      queryKey: [ESPRESSO_SHOTS_QUERY_KEY, userId],
      // Reading signal is also what tells TanStack a cancelled refresh must
      // not go on to its older pages.
      queryFn: ({
        pageParam,
        signal,
      }: {
        pageParam: EspressoShotCursor | undefined
        signal: AbortSignal
      }) => api.listShots(pageParam, signal),
      initialPageParam: undefined as EspressoShotCursor | undefined,
      getNextPageParam: (lastPage: ShotPage) =>
        lastPage.nextCursor ?? undefined,
    }),
    [api, userId],
  )
  const shots = useInfiniteQuery(shotsOptions)

  const items = useMemo(
    () => shots.data?.pages.flatMap((page) => page.items) ?? [],
    [shots.data],
  )

  const catalog: EspressoCatalog | null = equipment.data
    ? { ...equipment.data, shots: items }
    : null

  // A history read that is out, or paused offline, is not an empty history.
  const historyReading = shots.isFetching && !shots.isFetchingNextPage
  const loading =
    equipment.isPending ||
    (items.length === 0 &&
      (shots.isPending || shots.fetchStatus === 'paused' || historyReading))

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

  // Retry stays available while any failed request is not already running
  // again; each one retries on its own.
  const equipmentRetryable = equipmentFailed && !equipment.isFetching
  const historyRetryable = historyFailed && !historyReading
  const retrying =
    (equipmentFailed || historyFailed) &&
    !equipmentRetryable &&
    !historyRetryable

  // Reads the first page again through the history query itself, so a focus
  // or reconnect refetch joins it instead of racing it. Success makes that
  // page the whole history (the saved shot shows without waiting on older
  // pages); failure keeps the loaded rows, holds paging for Retry, and marks
  // the history stale so a reconnect recovers it too.
  const refreshFirstPage = useCallback(async () => {
    // A read begun before the save must not stand in for this one.
    await queryClient.cancelQueries({ queryKey: shotsOptions.queryKey })
    try {
      await queryClient.infiniteQuery({
        ...shotsOptions,
        pages: 1,
        staleTime: 0,
      })
    } catch {
      await queryClient.invalidateQueries({
        queryKey: shotsOptions.queryKey,
        refetchType: 'none',
      })
    }
  }, [queryClient, shotsOptions])

  const reload = useCallback(() => {
    if (equipmentRetryable) void equipment.refetch()
    if (historyRetryable) void refreshFirstPage()
  }, [equipment, equipmentRetryable, historyRetryable, refreshFirstPage])

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
          void refreshFirstPage()
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
    [createShot, queryClient, refreshFirstPage, userId],
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
