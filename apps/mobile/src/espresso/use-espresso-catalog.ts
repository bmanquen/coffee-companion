import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import type {
  EspressoApi,
  EspressoCatalog,
  ShotCreate,
  ShotCursor,
  ShotPage,
  ShotRow,
} from './types'

export const ESPRESSO_EQUIPMENT_QUERY_KEY = 'espresso-equipment'
export const ESPRESSO_SHOTS_QUERY_KEY = 'espresso-shots'

function linkedShotPages(
  data: { pages: Array<ShotPage>; pageParams: Array<unknown> } | undefined,
): Array<ShotPage> {
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

export function useEspressoCatalog(api: EspressoApi, userId: string) {
  const queryClient = useQueryClient()
  const userIdRef = useRef(userId)
  userIdRef.current = userId
  const apiRef = useRef(api)
  const sourceRef = useRef(0)
  if (apiRef.current !== api) {
    apiRef.current = api
    sourceRef.current += 1
  }
  const source = sourceRef.current
  const saveGen = useRef(0)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    saveGen.current += 1
    setBusy(false)
    setSaveError(null)
  }, [userId])

  const equipment = useQuery({
    queryKey: [ESPRESSO_EQUIPMENT_QUERY_KEY, userId, source],
    queryFn: () => api.load(),
  })
  const shots = useInfiniteQuery({
    queryKey: [ESPRESSO_SHOTS_QUERY_KEY, userId, source],
    queryFn: ({ pageParam }) => api.listShots(pageParam),
    initialPageParam: undefined as ShotCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  useEffect(() => {
    // Infinite refetch keeps stored pageParams. Extra pages that no longer
    // follow the first page's nextCursor belong to a different chain.
    if (shots.isFetching) return
    const data = shots.data
    if (!data || data.pages.length < 2) return
    const linked = linkedShotPages(data)
    if (linked.length === data.pages.length) return
    queryClient.setQueryData(
      [ESPRESSO_SHOTS_QUERY_KEY, userId, source],
      (current: InfiniteData<ShotPage, unknown> | undefined) => {
        if (!current || current.pages.length < 2) return current
        const nextLinked = linkedShotPages(current)
        if (nextLinked.length === current.pages.length) return current
        return {
          pages: nextLinked,
          pageParams: current.pageParams.slice(0, nextLinked.length),
        }
      },
    )
  }, [queryClient, shots.data, shots.isFetching, source, userId])

  const items = useMemo(() => {
    const linked = linkedShotPages(shots.data)
    const rows: Array<ShotRow> = []
    const seen = new Set<string>()
    for (const page of linked) {
      for (const row of page.items) {
        if (seen.has(row.id)) continue
        seen.add(row.id)
        rows.push(row)
      }
    }
    return rows
  }, [shots.data])

  const catalog: EspressoCatalog | null = equipment.data
    ? {
        ...equipment.data,
        shots: items,
        total: shots.data?.pages[0]?.total ?? equipment.data.total,
        nextCursor: linkedShotPages(shots.data).at(-1)?.nextCursor ?? null,
      }
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
    const pages = linkedShotPages(shots.data)
    if (pages.length === 0) return
    const last = pages[pages.length - 1]
    if (last.nextCursor == null) return
    if (shots.data && pages.length < shots.data.pages.length) {
      queryClient.setQueryData([ESPRESSO_SHOTS_QUERY_KEY, userId, source], {
        pages,
        pageParams: shots.data.pageParams.slice(0, pages.length),
      })
    }
    void shots.fetchNextPage()
  }, [equipment.isPending, queryClient, shots, source, userId])

  const createShot = useMutation({
    mutationFn: (input: ShotCreate) => api.create(input),
  })

  const save = useCallback(
    (input: ShotCreate, onSuccess?: () => void) => {
      if (busy || createShot.isPending) return
      const startedUser = userId
      const startedGen = saveGen.current
      setBusy(true)
      setSaveError(null)
      createShot.mutate(input, {
        onSuccess: () => {
          if (
            startedUser !== userIdRef.current ||
            startedGen !== saveGen.current
          ) {
            return
          }
          onSuccess?.()
          void queryClient.invalidateQueries({
            queryKey: [ESPRESSO_SHOTS_QUERY_KEY, startedUser, source],
          })
        },
        onError: (error) => {
          if (
            startedUser !== userIdRef.current ||
            startedGen !== saveGen.current
          ) {
            return
          }
          setSaveError(apiErrorMessage(error, ERROR_SAVE_FAILED))
        },
        onSettled: () => {
          if (
            startedUser !== userIdRef.current ||
            startedGen !== saveGen.current
          ) {
            return
          }
          setBusy(false)
        },
      })
    },
    [busy, createShot, queryClient, source, userId],
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
    busy,
    saveError,
    reload,
    loadMore,
    loadPrefill,
    save,
    clearSaveError,
  }
}
