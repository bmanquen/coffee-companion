import { useCallback, useMemo, useRef, useState } from 'react'
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
  // The first-page read after a save. Its result replaces the cached pages
  // only when it succeeds, so a failure keeps every loaded row.
  const [saveRefresh, setSaveRefresh] = useState<{
    pending: boolean
    error: unknown
    // The history's dataUpdatedAt when the read failed.
    failedOver: number
  }>({ pending: false, error: null, failedOver: 0 })
  const saveRefreshRun = useRef<AbortController | null>(null)

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

  // A read that is paused (offline) or still owed after a save is not an
  // empty history yet. A failed post-save read is not loading either: it may
  // have cancelled the first read, which leaves the query pending.
  // Until a read succeeds: Retry's own, or any later refetch of the history
  // (focus, reconnect), which brings the saved shot too.
  const saveRefreshFailed =
    saveRefresh.error != null && shots.dataUpdatedAt === saveRefresh.failedOver
  const loading =
    equipment.isPending ||
    (items.length === 0 &&
      !saveRefreshFailed &&
      (shots.isPending ||
        saveRefresh.pending ||
        shots.fetchStatus === 'paused' ||
        (shots.isFetching && !shots.isFetchingNextPage)))

  const equipmentFailed = equipment.isError && !equipment.data
  const historyFailed =
    (shots.isError && !shots.isFetchNextPageError) || saveRefreshFailed
  const loadError = equipmentFailed
    ? apiErrorMessage(equipment.error, ERROR_LOAD_FAILED)
    : historyFailed
      ? apiErrorMessage(
          saveRefreshFailed ? saveRefresh.error : shots.error,
          ERROR_LOAD_FAILED,
        )
      : null

  const loadMoreError = shots.isFetchNextPageError
    ? apiErrorMessage(shots.error, ERROR_LOAD_MORE_FAILED)
    : null

  // Each failed request retries on its own, so a failed history read can be
  // retried while equipment is still loading, and the reverse.
  const retrying =
    (equipmentFailed && equipment.isFetching) ||
    (historyFailed && (shots.isRefetching || saveRefresh.pending))

  const shotsKey = useMemo(() => [ESPRESSO_SHOTS_QUERY_KEY, userId], [userId])

  // Reads the first page again and, only when that succeeds, makes it the
  // whole history: the saved shot shows without waiting on older pages, and
  // a failure leaves the loaded rows and holds paging for the Retry.
  const refreshFirstPage = useCallback(async () => {
    saveRefreshRun.current?.abort()
    const run = new AbortController()
    saveRefreshRun.current = run
    // A failure stays shown (with its Retry busy) until a read succeeds.
    setSaveRefresh((prev) => ({ ...prev, pending: true }))
    // A read begun before the save must not land after this one.
    await queryClient.cancelQueries({ queryKey: shotsKey })
    try {
      const page = await api.listShots(undefined, run.signal)
      if (saveRefreshRun.current !== run) return
      queryClient.setQueryData<
        InfiniteData<ShotPage, EspressoShotCursor | undefined>
      >(shotsKey, { pages: [page], pageParams: [undefined] })
      setSaveRefresh({ pending: false, error: null, failedOver: 0 })
    } catch (error) {
      if (saveRefreshRun.current !== run) return
      setSaveRefresh({
        pending: false,
        error,
        failedOver: queryClient.getQueryState(shotsKey)?.dataUpdatedAt ?? 0,
      })
    }
  }, [api, queryClient, shotsKey])

  const reload = useCallback(() => {
    if (retrying) return
    if (equipmentFailed) void equipment.refetch()
    if (saveRefreshFailed) void refreshFirstPage()
    else if (historyFailed) void shots.refetch()
  }, [
    equipment,
    equipmentFailed,
    historyFailed,
    refreshFirstPage,
    retrying,
    saveRefreshFailed,
    shots,
  ])

  const loadMore = useCallback(() => {
    // After a failed refresh the cached pages are stale; paging on from them
    // would hide its Retry. A failed next page keeps its own footer retry.
    if (
      shots.isFetchingNextPage ||
      shots.isRefetching ||
      shots.isRefetchError ||
      saveRefresh.pending ||
      saveRefreshFailed ||
      !shots.hasNextPage
    ) {
      return
    }
    void shots.fetchNextPage({ cancelRefetch: false })
  }, [saveRefresh.pending, saveRefreshFailed, shots])

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
    hasMore:
      shots.hasNextPage &&
      !shots.isRefetchError &&
      !saveRefresh.pending &&
      !saveRefreshFailed,
    refreshing:
      (shots.isRefetching && !shots.isFetchingNextPage) ||
      (saveRefresh.pending && items.length > 0),
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
