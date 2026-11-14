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
} from './types'

export const ESPRESSO_EQUIPMENT_QUERY_KEY = 'espresso-equipment'
export const ESPRESSO_SHOTS_QUERY_KEY = 'espresso-shots'

export function useEspressoCatalog(api: EspressoApi, userId: string) {
  const queryClient = useQueryClient()
  const [saveError, setSaveError] = useState<string | null>(null)

  const equipment = useQuery({
    queryKey: [ESPRESSO_EQUIPMENT_QUERY_KEY, userId],
    queryFn: () => api.load(),
  })
  const shots = useInfiniteQuery({
    queryKey: [ESPRESSO_SHOTS_QUERY_KEY, userId],
    queryFn: ({ pageParam }) => api.listShots(pageParam),
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

  const loadError =
    equipment.isError && !equipment.data
      ? apiErrorMessage(equipment.error, ERROR_LOAD_FAILED)
      : shots.isError && !shots.isFetchNextPageError
        ? apiErrorMessage(shots.error, ERROR_LOAD_FAILED)
        : null

  const loadMoreError = shots.isFetchNextPageError
    ? apiErrorMessage(shots.error, ERROR_LOAD_MORE_FAILED)
    : null

  const reload = useCallback(() => {
    if (loading) return
    void equipment.refetch()
    void shots.refetch()
  }, [equipment, loading, shots])

  const loadMore = useCallback(() => {
    if (
      shots.isFetchingNextPage ||
      shots.isRefetching ||
      equipment.isPending ||
      !shots.hasNextPage
    ) {
      return
    }
    void shots.fetchNextPage({ cancelRefetch: false })
  }, [equipment.isPending, shots])

  const createShot = useMutation({
    mutationFn: (input: ShotCreate) => api.create(input),
  })

  const save = useCallback(
    (input: ShotCreate, onSuccess?: () => void) => {
      if (createShot.isPending) return
      setSaveError(null)
      createShot.mutate(input, {
        onSuccess: () => {
          onSuccess?.()
          void queryClient.invalidateQueries({
            queryKey: [ESPRESSO_SHOTS_QUERY_KEY, userId],
          })
        },
        onError: (error) => {
          setSaveError(apiErrorMessage(error, ERROR_SAVE_FAILED))
        },
      })
    },
    [createShot, queryClient, userId],
  )

  const loadPrefill = useCallback(
    (coffeeId: string) =>
      queryClient.fetchQuery({
        queryKey: ['espresso-prefill', userId, coffeeId],
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
    loading,
    loadingMore: shots.isFetchingNextPage,
    loadMoreError,
    loadError,
    busy: createShot.isPending,
    saveError,
    reload,
    loadMore,
    loadPrefill,
    save,
    clearSaveError,
  }
}
