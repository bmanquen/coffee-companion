import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  ESPRESSO_LOAD_FAILED,
  ESPRESSO_LOAD_MORE_FAILED,
  ESPRESSO_SHOT_PAGE_SIZE,
  ESPRESSO_SHOT_Q_MAX,
  espressoShotPageInput,
  useEspressoShotPages,
} from './use-espresso-shot-pages'
import { espressoShotCursor, seedEspressoShotPage } from '@/test/espresso-shots'
import { makeRecentCoffee, makeRecentShot } from '@/test/factories'
import { createTestProviders } from '@/test/providers'
import { trpcSuccess } from '@/test/trpc-response'

const FILTERED_COFFEE_ID = 'c-filtered'
const STALE_EXTRA_ID = 'stale-extra'
const RETRY_EXTRA_ID = 'retry-extra'
const KEPT_EXTRA_ID = 'kept-extra'
const REMOVED_EXTRA_ID = 'removed-extra'
const REFRESHED_FIRST_ID = 'refreshed-0'
const PAGE_THREE_ID = 'page-three'

async function requestText(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<string> {
  if (input instanceof Request) return input.clone().text()
  return String(init?.body ?? input)
}

function bumpFirstPage(
  queryClient: Parameters<typeof seedEspressoShotPage>[0],
  trpc: Parameters<typeof seedEspressoShotPage>[1],
) {
  queryClient.setQueryData(
    trpc.espressoShot.getRecent.queryKey(espressoShotPageInput()),
    (page) => (page == null ? page : { ...page }),
  )
}

function pageOf(
  count: number,
  idPrefix: string,
  coffeeId = idPrefix,
  coffeeName = `Coffee ${idPrefix}`,
) {
  return Array.from({ length: count }, (_, index) =>
    makeRecentShot({
      id: `${idPrefix}${index}`,
      coffeeId,
      coffee: makeRecentCoffee({
        id: coffeeId,
        name: `${coffeeName} ${index}`,
      }),
    }),
  )
}

describe('espressoShotPageInput', () => {
  it('keeps q within the API limit', () => {
    const q = 'x'.repeat(ESPRESSO_SHOT_Q_MAX + 25)
    expect(espressoShotPageInput(undefined, { q }).q).toHaveLength(
      ESPRESSO_SHOT_Q_MAX,
    )
  })

  it('omits blank q and uses the shared page size', () => {
    expect(espressoShotPageInput()).toEqual({ limit: ESPRESSO_SHOT_PAGE_SIZE })
    expect(espressoShotPageInput(undefined, { q: '   ' })).toEqual({
      limit: ESPRESSO_SHOT_PAGE_SIZE,
    })
  })

  it('passes an opaque cursor through as-is', () => {
    expect(espressoShotPageInput('next-page-token')).toEqual({
      limit: ESPRESSO_SHOT_PAGE_SIZE,
      cursor: 'next-page-token',
    })
  })

  it('passes dialedIn when the filter is on', () => {
    expect(espressoShotPageInput(undefined, { dialedIn: true })).toEqual({
      limit: ESPRESSO_SHOT_PAGE_SIZE,
      dialedIn: true,
    })
  })
})

describe('useEspressoShotPages', () => {
  it('keeps the same empty items while the first page is pending', () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => new Promise(() => {}))
    try {
      const { Wrapper } = createTestProviders()
      const { result, rerender } = renderHook(() => useEspressoShotPages(), {
        wrapper: Wrapper,
      })
      expect(result.current.items).toEqual([])
      expect(result.current.loading).toBe(true)
      const pendingItems = result.current.items
      rerender()
      expect(result.current.items).toBe(pendingItems)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('does not append a load-more that resolves after the filter changes', async () => {
    let resolveExtra: (value: Response) => void = () => {}
    const pendingExtra = new Promise<Response>((resolve) => {
      resolveExtra = resolve
    })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => pendingExtra)
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
      const filtered = [
        makeRecentShot({
          id: 'filtered',
          coffeeId: FILTERED_COFFEE_ID,
          coffee: makeRecentCoffee({
            id: FILTERED_COFFEE_ID,
            name: 'Filtered Coffee',
          }),
        }),
      ]
      seedEspressoShotPage(queryClient, trpc, first, first.length + 1)
      seedEspressoShotPage(queryClient, trpc, filtered, 1, undefined, {
        coffeeId: FILTERED_COFFEE_ID,
      })

      const { result, rerender } = renderHook(
        ({ coffeeId }: { coffeeId?: string }) =>
          useEspressoShotPages({ coffeeId }),
        { wrapper: Wrapper, initialProps: {} },
      )
      expect(result.current.items).toHaveLength(ESPRESSO_SHOT_PAGE_SIZE)

      await act(async () => {
        void result.current.loadMore()
      })
      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())

      rerender({ coffeeId: FILTERED_COFFEE_ID })
      await waitFor(() => {
        expect(result.current.items.map((shot) => shot.id)).toEqual([
          'filtered',
        ])
      })

      await act(async () => {
        resolveExtra(
          trpcSuccess({
            items: [
              makeRecentShot({
                id: STALE_EXTRA_ID,
                coffee: makeRecentCoffee({ name: 'Stale Extra' }),
              }),
            ],
            total: ESPRESSO_SHOT_PAGE_SIZE + 1,
            nextCursor: null,
          }),
        )
        await pendingExtra
      })

      expect(result.current.items.map((shot) => shot.id)).toEqual(['filtered'])
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('clears the load-more error after a successful retry', async () => {
    const extra = makeRecentShot({
      id: RETRY_EXTRA_ID,
      coffeeId: 'c-next',
      coffee: makeRecentCoffee({ id: 'c-next', name: 'Coffee extra' }),
    })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce(
        trpcSuccess({
          items: [extra],
          total: ESPRESSO_SHOT_PAGE_SIZE + 1,
          nextCursor: null,
        }),
      )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
      seedEspressoShotPage(queryClient, trpc, first, first.length + 1)

      const { result } = renderHook(() => useEspressoShotPages(), {
        wrapper: Wrapper,
      })

      await act(async () => {
        await result.current.loadMore()
      })
      expect(result.current.loadMoreError).toBe(ESPRESSO_LOAD_MORE_FAILED)

      await act(async () => {
        await result.current.loadMore()
      })
      expect(result.current.loadMoreError).toBeNull()
      expect(
        result.current.items.some((shot) => shot.id === RETRY_EXTRA_ID),
      ).toBe(true)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('keeps extra shots when a first-page refetch fails', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Network request failed'))
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
      const extraShot = makeRecentShot({
        id: RETRY_EXTRA_ID,
        coffeeId: 'c-next',
        coffee: makeRecentCoffee({ id: 'c-next', name: 'Coffee extra' }),
      })
      seedEspressoShotPage(queryClient, trpc, first, first.length + 1)
      seedEspressoShotPage(
        queryClient,
        trpc,
        [extraShot],
        first.length + 1,
        espressoShotCursor(first[first.length - 1]),
      )

      const { result } = renderHook(() => useEspressoShotPages(), {
        wrapper: Wrapper,
      })

      await act(async () => {
        await result.current.loadMore()
      })
      expect(
        result.current.items.some((shot) => shot.id === RETRY_EXTRA_ID),
      ).toBe(true)

      await act(async () => {
        await result.current.retry()
      })
      await waitFor(() =>
        expect(result.current.loadError).toBe(ESPRESSO_LOAD_FAILED),
      )
      expect(
        result.current.items.some((shot) => shot.id === RETRY_EXTRA_ID),
      ).toBe(true)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('keeps extra shots when a first-page refetch keeps the same cursor boundary', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
      const extraShot = makeRecentShot({
        id: RETRY_EXTRA_ID,
        coffeeId: 'c-next',
        coffee: makeRecentCoffee({ id: 'c-next', name: 'Coffee extra' }),
      })
      const boundary = espressoShotCursor(first[first.length - 1])
      seedEspressoShotPage(queryClient, trpc, first, first.length + 1)
      seedEspressoShotPage(
        queryClient,
        trpc,
        [extraShot],
        first.length + 1,
        boundary,
      )
      fetchSpy.mockImplementation(async (input, init) => {
        const body = await requestText(input, init)
        if (body.includes(boundary)) {
          return trpcSuccess({
            items: [extraShot],
            total: first.length + 1,
            nextCursor: null,
          })
        }
        return trpcSuccess({
          items: first,
          total: first.length + 1,
          nextCursor: boundary,
        })
      })

      const { result } = renderHook(() => useEspressoShotPages(), {
        wrapper: Wrapper,
      })

      await act(async () => {
        await result.current.loadMore()
      })
      expect(
        result.current.items.some((shot) => shot.id === RETRY_EXTRA_ID),
      ).toBe(true)

      await act(async () => {
        await result.current.retry()
      })
      await waitFor(() => expect(result.current.loadError).toBeNull())
      expect(
        result.current.items.some((shot) => shot.id === RETRY_EXTRA_ID),
      ).toBe(true)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('applies a load-more that finishes after a same-cursor first-page refetch', async () => {
    const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
    const extraShot = makeRecentShot({
      id: RETRY_EXTRA_ID,
      coffeeId: 'c-next',
      coffee: makeRecentCoffee({ id: 'c-next', name: 'Coffee extra' }),
    })
    const refreshed = makeRecentShot({
      id: REFRESHED_FIRST_ID,
      coffee: makeRecentCoffee({ name: 'Coffee refreshed' }),
    })
    const boundary = espressoShotCursor(first[first.length - 1])
    const pending: Array<(value: Response) => void> = []
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            pending.push(resolve)
          }),
      )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      seedEspressoShotPage(queryClient, trpc, first, first.length + 1)
      const { result } = renderHook(() => useEspressoShotPages(), {
        wrapper: Wrapper,
      })
      await waitFor(() =>
        expect(result.current.items).toHaveLength(ESPRESSO_SHOT_PAGE_SIZE),
      )
      pending.length = 0

      let loadMoreDone: Promise<void> = Promise.resolve()
      await act(async () => {
        loadMoreDone = result.current.loadMore()
      })
      await waitFor(() => expect(pending).toHaveLength(1))

      await act(async () => {
        void result.current.retry()
      })
      await waitFor(() => expect(pending).toHaveLength(2))

      await act(async () => {
        pending[1](
          trpcSuccess({
            items: [refreshed, ...first.slice(1)],
            total: first.length + 1,
            nextCursor: boundary,
          }),
        )
      })
      await waitFor(() =>
        expect(
          result.current.items.some((shot) => shot.id === REFRESHED_FIRST_ID),
        ).toBe(true),
      )

      await act(async () => {
        pending[0](
          trpcSuccess({
            items: [extraShot],
            total: first.length + 1,
            nextCursor: null,
          }),
        )
        await loadMoreDone
      })

      expect(
        result.current.items.some((shot) => shot.id === RETRY_EXTRA_ID),
      ).toBe(true)
      expect(result.current.hasMore).toBe(false)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('drops extra shots after a successful first-page refetch', async () => {
    const refreshed = makeRecentShot({
      id: REFRESHED_FIRST_ID,
      coffee: makeRecentCoffee({ name: 'Coffee refreshed' }),
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        trpcSuccess({
          items: [refreshed],
          total: 1,
          nextCursor: null,
        }),
      ),
    )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
      const extraShot = makeRecentShot({
        id: RETRY_EXTRA_ID,
        coffeeId: 'c-next',
        coffee: makeRecentCoffee({ id: 'c-next', name: 'Coffee extra' }),
      })
      seedEspressoShotPage(queryClient, trpc, first, first.length + 1)
      seedEspressoShotPage(
        queryClient,
        trpc,
        [extraShot],
        first.length + 1,
        espressoShotCursor(first[first.length - 1]),
      )

      const { result } = renderHook(() => useEspressoShotPages(), {
        wrapper: Wrapper,
      })

      await act(async () => {
        await result.current.loadMore()
      })
      expect(
        result.current.items.some((shot) => shot.id === RETRY_EXTRA_ID),
      ).toBe(true)

      await act(async () => {
        await result.current.retry()
      })
      await waitFor(() => {
        expect(result.current.items.map((shot) => shot.id)).toEqual([
          REFRESHED_FIRST_ID,
        ])
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('drops a removed extra shot without dropping the rest', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
    const kept = makeRecentShot({
      id: KEPT_EXTRA_ID,
      coffeeId: 'c-kept',
      coffee: makeRecentCoffee({ id: 'c-kept', name: 'Coffee kept' }),
    })
    const removed = makeRecentShot({
      id: REMOVED_EXTRA_ID,
      coffeeId: 'c-removed',
      coffee: makeRecentCoffee({ id: 'c-removed', name: 'Coffee removed' }),
    })
    seedEspressoShotPage(queryClient, trpc, first, first.length + 2)
    seedEspressoShotPage(
      queryClient,
      trpc,
      [kept, removed],
      first.length + 2,
      espressoShotCursor(first[first.length - 1]),
    )

    const { result } = renderHook(() => useEspressoShotPages(), {
      wrapper: Wrapper,
    })

    await act(async () => {
      await result.current.loadMore()
    })

    act(() => {
      result.current.removeShot(REMOVED_EXTRA_ID)
    })

    const ids = result.current.items.map((shot) => shot.id)
    expect(ids).toContain(KEPT_EXTRA_ID)
    expect(ids).not.toContain(REMOVED_EXTRA_ID)
    expect(ids).toHaveLength(ESPRESSO_SHOT_PAGE_SIZE + 1)
  })

  it('keeps a removed extra shot gone when an in-flight extra refresh finishes with it', async () => {
    const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
    const kept = makeRecentShot({
      id: KEPT_EXTRA_ID,
      coffeeId: 'c-kept',
      coffee: makeRecentCoffee({ id: 'c-kept', name: 'Coffee kept' }),
    })
    const removed = makeRecentShot({
      id: REMOVED_EXTRA_ID,
      coffeeId: 'c-removed',
      coffee: makeRecentCoffee({ id: 'c-removed', name: 'Coffee removed' }),
    })
    const boundary = espressoShotCursor(first[first.length - 1])
    let replayStarted = false
    let extraCursorFetches = 0
    let resolveExtra: (value: Response) => void = () => {}
    const extraPending = new Promise<Response>((resolve) => {
      resolveExtra = resolve
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input, init) => {
        const body = await requestText(input, init)
        if (body.includes(boundary)) {
          extraCursorFetches += 1
          if (replayStarted) return extraPending
          return trpcSuccess({
            items: [kept, removed],
            total: first.length + 2,
            nextCursor: null,
          })
        }
        return trpcSuccess({
          items: first,
          total: first.length + 2,
          nextCursor: boundary,
        })
      },
    )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      seedEspressoShotPage(queryClient, trpc, first, first.length + 2)
      seedEspressoShotPage(
        queryClient,
        trpc,
        [kept, removed],
        first.length + 2,
        boundary,
      )

      const { result } = renderHook(() => useEspressoShotPages(), {
        wrapper: Wrapper,
      })

      await act(async () => {
        await result.current.loadMore()
      })
      expect(
        result.current.items.some((shot) => shot.id === REMOVED_EXTRA_ID),
      ).toBe(true)

      replayStarted = true
      extraCursorFetches = 0
      await act(async () => {
        bumpFirstPage(queryClient, trpc)
      })
      await waitFor(() => expect(extraCursorFetches).toBe(1))

      act(() => {
        result.current.removeShot(REMOVED_EXTRA_ID)
      })
      expect(
        result.current.items.some((shot) => shot.id === REMOVED_EXTRA_ID),
      ).toBe(false)

      await act(async () => {
        resolveExtra(
          trpcSuccess({
            items: [kept, removed],
            total: first.length + 2,
            nextCursor: null,
          }),
        )
      })

      await waitFor(() => {
        expect(
          result.current.items.some((shot) => shot.id === KEPT_EXTRA_ID),
        ).toBe(true)
        expect(
          result.current.items.some((shot) => shot.id === REMOVED_EXTRA_ID),
        ).toBe(false)
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('keeps a removed extra shot gone when a later extra refresh joins the pre-delete fetch', async () => {
    const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
    const kept = makeRecentShot({
      id: KEPT_EXTRA_ID,
      coffeeId: 'c-kept',
      coffee: makeRecentCoffee({ id: 'c-kept', name: 'Coffee kept' }),
    })
    const removed = makeRecentShot({
      id: REMOVED_EXTRA_ID,
      coffeeId: 'c-removed',
      coffee: makeRecentCoffee({ id: 'c-removed', name: 'Coffee removed' }),
    })
    const boundary = espressoShotCursor(first[first.length - 1])
    let replayStarted = false
    let extraCursorFetches = 0
    let resolveExtra: (value: Response) => void = () => {}
    const extraPending = new Promise<Response>((resolve) => {
      resolveExtra = resolve
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input, init) => {
        const body = await requestText(input, init)
        if (body.includes(boundary)) {
          extraCursorFetches += 1
          if (replayStarted) return extraPending
          return trpcSuccess({
            items: [kept, removed],
            total: first.length + 2,
            nextCursor: null,
          })
        }
        return trpcSuccess({
          items: first,
          total: first.length + 2,
          nextCursor: boundary,
        })
      },
    )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      seedEspressoShotPage(queryClient, trpc, first, first.length + 2)
      seedEspressoShotPage(
        queryClient,
        trpc,
        [kept, removed],
        first.length + 2,
        boundary,
      )

      const { result } = renderHook(() => useEspressoShotPages(), {
        wrapper: Wrapper,
      })

      await act(async () => {
        await result.current.loadMore()
      })

      replayStarted = true
      extraCursorFetches = 0
      await act(async () => {
        bumpFirstPage(queryClient, trpc)
      })
      await waitFor(() => expect(extraCursorFetches).toBe(1))

      act(() => {
        result.current.removeShot(REMOVED_EXTRA_ID)
      })

      await act(async () => {
        bumpFirstPage(queryClient, trpc)
      })
      await waitFor(() => expect(extraCursorFetches).toBe(1))

      await act(async () => {
        resolveExtra(
          trpcSuccess({
            items: [kept, removed],
            total: first.length + 2,
            nextCursor: null,
          }),
        )
      })

      await waitFor(() => {
        expect(
          result.current.items.some((shot) => shot.id === KEPT_EXTRA_ID),
        ).toBe(true)
        expect(
          result.current.items.some((shot) => shot.id === REMOVED_EXTRA_ID),
        ).toBe(false)
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('refreshes extra-row dialed-in after a same-boundary first-page refetch', async () => {
    const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
    const extraShot = makeRecentShot({
      id: RETRY_EXTRA_ID,
      coffeeId: 'c-next',
      isDialedIn: true,
      coffee: makeRecentCoffee({ id: 'c-next', name: 'Coffee extra' }),
    })
    const boundary = espressoShotCursor(first[first.length - 1])
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input, init) => {
        const body = await requestText(input, init)
        if (body.includes(boundary)) {
          return trpcSuccess({
            items: [{ ...extraShot, isDialedIn: false }],
            total: first.length + 1,
            nextCursor: null,
          })
        }
        return trpcSuccess({
          items: first,
          total: first.length + 1,
          nextCursor: boundary,
        })
      },
    )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      seedEspressoShotPage(queryClient, trpc, first, first.length + 1)
      seedEspressoShotPage(
        queryClient,
        trpc,
        [extraShot],
        first.length + 1,
        boundary,
      )

      const { result } = renderHook(() => useEspressoShotPages(), {
        wrapper: Wrapper,
      })

      await act(async () => {
        await result.current.loadMore()
      })
      expect(
        result.current.items.find((shot) => shot.id === RETRY_EXTRA_ID)
          ?.isDialedIn,
      ).toBe(true)

      await act(async () => {
        await queryClient.invalidateQueries(
          trpc.espressoShot.getRecent.queryFilter(),
        )
      })
      await waitFor(() =>
        expect(
          result.current.items.find((shot) => shot.id === RETRY_EXTRA_ID)
            ?.isDialedIn,
        ).toBe(false),
      )
      expect(
        result.current.items.some((shot) => shot.id === RETRY_EXTRA_ID),
      ).toBe(true)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('refreshes extra-row dialed-in after load more that overlapped a same-boundary refetch', async () => {
    const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
    const extraShot = makeRecentShot({
      id: RETRY_EXTRA_ID,
      coffeeId: 'c-next',
      isDialedIn: true,
      coffee: makeRecentCoffee({ id: 'c-next', name: 'Coffee extra' }),
    })
    const pageThree = makeRecentShot({
      id: PAGE_THREE_ID,
      coffeeId: 'c-three',
      isDialedIn: true,
      coffee: makeRecentCoffee({ id: 'c-three', name: 'Coffee three' }),
    })
    const boundary = espressoShotCursor(first[first.length - 1])
    const extraBoundary = espressoShotCursor(extraShot)
    let extraPageReleased = false
    let resolvePageThree: (value: Response) => void = () => {}
    const pageThreePending = new Promise<Response>((resolve) => {
      resolvePageThree = resolve
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input, init) => {
        const body = await requestText(input, init)
        if (body.includes(extraBoundary)) {
          if (!extraPageReleased) return pageThreePending
          return trpcSuccess({
            items: [{ ...pageThree, isDialedIn: false }],
            total: first.length + 2,
            nextCursor: null,
          })
        }
        if (body.includes(boundary)) {
          return trpcSuccess({
            items: [{ ...extraShot, isDialedIn: false }],
            total: first.length + 2,
            nextCursor: extraBoundary,
          })
        }
        return trpcSuccess({
          items: first,
          total: first.length + 2,
          nextCursor: boundary,
        })
      },
    )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      seedEspressoShotPage(queryClient, trpc, first, first.length + 2)
      seedEspressoShotPage(
        queryClient,
        trpc,
        [extraShot],
        first.length + 2,
        boundary,
        {},
        extraBoundary,
      )

      const { result } = renderHook(() => useEspressoShotPages(), {
        wrapper: Wrapper,
      })

      await act(async () => {
        await result.current.loadMore()
      })
      expect(
        result.current.items.find((shot) => shot.id === RETRY_EXTRA_ID)
          ?.isDialedIn,
      ).toBe(true)
      expect(result.current.hasMore).toBe(true)

      let loadMoreDone: Promise<void> = Promise.resolve()
      await act(async () => {
        loadMoreDone = result.current.loadMore()
      })
      expect(result.current.loadingMore).toBe(true)

      const callsBeforeInvalidate = fetchSpy.mock.calls.length
      await act(async () => {
        void queryClient.invalidateQueries(
          trpc.espressoShot.getRecent.queryFilter(),
        )
      })
      await waitFor(() =>
        expect(fetchSpy.mock.calls.length).toBeGreaterThan(
          callsBeforeInvalidate,
        ),
      )
      expect(result.current.loadingMore).toBe(true)

      await act(async () => {
        resolvePageThree(
          trpcSuccess({
            items: [pageThree],
            total: first.length + 2,
            nextCursor: null,
          }),
        )
        extraPageReleased = true
        await loadMoreDone
      })

      await waitFor(() => {
        expect(
          result.current.items.find((shot) => shot.id === RETRY_EXTRA_ID)
            ?.isDialedIn,
        ).toBe(false)
        expect(
          result.current.items.find((shot) => shot.id === PAGE_THREE_ID)
            ?.isDialedIn,
        ).toBe(false)
      })
      const ids = result.current.items.map((shot) => shot.id)
      expect(ids).toEqual([
        ...first.map((shot) => shot.id),
        RETRY_EXTRA_ID,
        PAGE_THREE_ID,
      ])
      expect(new Set(ids).size).toBe(ids.length)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('refreshes extra-row dialed-in after a failed load more that overlapped a same-boundary refetch', async () => {
    const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
    const extraShot = makeRecentShot({
      id: RETRY_EXTRA_ID,
      coffeeId: 'c-next',
      isDialedIn: true,
      coffee: makeRecentCoffee({ id: 'c-next', name: 'Coffee extra' }),
    })
    const boundary = espressoShotCursor(first[first.length - 1])
    const extraBoundary = espressoShotCursor(extraShot)
    let extraPageReleased = false
    let rejectPageThree: (reason: Error) => void = () => {}
    const pageThreePending = new Promise<Response>((_resolve, reject) => {
      rejectPageThree = reject
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input, init) => {
        const body = await requestText(input, init)
        if (body.includes(extraBoundary)) {
          if (!extraPageReleased) return pageThreePending
          return trpcSuccess({
            items: [{ ...extraShot, isDialedIn: false }],
            total: first.length + 1,
            nextCursor: extraBoundary,
          })
        }
        if (body.includes(boundary)) {
          return trpcSuccess({
            items: [{ ...extraShot, isDialedIn: false }],
            total: first.length + 1,
            nextCursor: extraBoundary,
          })
        }
        return trpcSuccess({
          items: first,
          total: first.length + 1,
          nextCursor: boundary,
        })
      },
    )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      seedEspressoShotPage(queryClient, trpc, first, first.length + 1)
      seedEspressoShotPage(
        queryClient,
        trpc,
        [extraShot],
        first.length + 1,
        boundary,
        {},
        extraBoundary,
      )

      const { result } = renderHook(() => useEspressoShotPages(), {
        wrapper: Wrapper,
      })

      await act(async () => {
        await result.current.loadMore()
      })
      expect(
        result.current.items.find((shot) => shot.id === RETRY_EXTRA_ID)
          ?.isDialedIn,
      ).toBe(true)

      let loadMoreDone: Promise<void> = Promise.resolve()
      await act(async () => {
        loadMoreDone = result.current.loadMore()
      })
      expect(result.current.loadingMore).toBe(true)

      const callsBeforeInvalidate = fetchSpy.mock.calls.length
      await act(async () => {
        void queryClient.invalidateQueries(
          trpc.espressoShot.getRecent.queryFilter(),
        )
      })
      await waitFor(() =>
        expect(fetchSpy.mock.calls.length).toBeGreaterThan(
          callsBeforeInvalidate,
        ),
      )
      expect(result.current.loadingMore).toBe(true)

      await act(async () => {
        extraPageReleased = true
        rejectPageThree(new Error('network'))
        await loadMoreDone
      })

      await waitFor(() => {
        expect(
          result.current.items.find((shot) => shot.id === RETRY_EXTRA_ID)
            ?.isDialedIn,
        ).toBe(false)
      })
      expect(result.current.loadMoreError).toBe(ESPRESSO_LOAD_MORE_FAILED)
      const ids = result.current.items.map((shot) => shot.id)
      expect(ids).toEqual([...first.map((shot) => shot.id), RETRY_EXTRA_ID])
      expect(ids).not.toContain(PAGE_THREE_ID)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('clears load-more try-again after a same-boundary refresh reaches the last extra page', async () => {
    const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
    const extraShot = makeRecentShot({
      id: RETRY_EXTRA_ID,
      coffeeId: 'c-next',
      coffee: makeRecentCoffee({ id: 'c-next', name: 'Coffee extra' }),
    })
    const boundary = espressoShotCursor(first[first.length - 1])
    const extraBoundary = espressoShotCursor(extraShot)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input, init) => {
        const body = await requestText(input, init)
        if (body.includes(extraBoundary)) {
          throw new Error('Network request failed')
        }
        if (body.includes(boundary)) {
          return trpcSuccess({
            items: [extraShot],
            total: first.length + 1,
            nextCursor: null,
          })
        }
        return trpcSuccess({
          items: first,
          total: first.length + 1,
          nextCursor: boundary,
        })
      },
    )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      seedEspressoShotPage(queryClient, trpc, first, first.length + 2)
      seedEspressoShotPage(
        queryClient,
        trpc,
        [extraShot],
        first.length + 2,
        boundary,
        {},
        extraBoundary,
      )

      const { result } = renderHook(() => useEspressoShotPages(), {
        wrapper: Wrapper,
      })

      await act(async () => {
        await result.current.loadMore()
      })
      expect(result.current.hasMore).toBe(true)

      await act(async () => {
        await result.current.loadMore()
      })
      expect(result.current.loadMoreError).toBe(ESPRESSO_LOAD_MORE_FAILED)

      await act(async () => {
        void queryClient.invalidateQueries(
          trpc.espressoShot.getRecent.queryFilter(),
        )
      })
      await waitFor(() => expect(result.current.hasMore).toBe(false))
      expect(result.current.loadMoreError).toBeNull()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('refreshes extra-row dialed-in after load more interrupts a same-boundary extra refresh', async () => {
    const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
    const extraShot = makeRecentShot({
      id: RETRY_EXTRA_ID,
      coffeeId: 'c-next',
      isDialedIn: true,
      coffee: makeRecentCoffee({ id: 'c-next', name: 'Coffee extra' }),
    })
    const pageThree = makeRecentShot({
      id: PAGE_THREE_ID,
      coffeeId: 'c-three',
      isDialedIn: true,
      coffee: makeRecentCoffee({ id: 'c-three', name: 'Coffee three' }),
    })
    const boundary = espressoShotCursor(first[first.length - 1])
    const extraBoundary = espressoShotCursor(extraShot)
    let hangExtraReplay = false
    let extraReplayReleased = false
    let resolveExtraReplay: (value: Response) => void = () => {}
    const extraReplayPending = new Promise<Response>((resolve) => {
      resolveExtraReplay = resolve
    })
    let pageThreeReleased = false
    let resolvePageThree: (value: Response) => void = () => {}
    const pageThreePending = new Promise<Response>((resolve) => {
      resolvePageThree = resolve
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input, init) => {
        const body = await requestText(input, init)
        if (body.includes(extraBoundary)) {
          if (!pageThreeReleased) return pageThreePending
          return trpcSuccess({
            items: [{ ...pageThree, isDialedIn: false }],
            total: first.length + 2,
            nextCursor: null,
          })
        }
        if (body.includes(boundary)) {
          if (hangExtraReplay && !extraReplayReleased) return extraReplayPending
          return trpcSuccess({
            items: [
              { ...extraShot, isDialedIn: hangExtraReplay ? false : true },
            ],
            total: first.length + 2,
            nextCursor: extraBoundary,
          })
        }
        return trpcSuccess({
          items: first,
          total: first.length + 2,
          nextCursor: boundary,
        })
      },
    )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      seedEspressoShotPage(queryClient, trpc, first, first.length + 2)
      seedEspressoShotPage(
        queryClient,
        trpc,
        [extraShot],
        first.length + 2,
        boundary,
        {},
        extraBoundary,
      )

      const { result } = renderHook(() => useEspressoShotPages(), {
        wrapper: Wrapper,
      })

      await act(async () => {
        await result.current.loadMore()
      })
      expect(
        result.current.items.find((shot) => shot.id === RETRY_EXTRA_ID)
          ?.isDialedIn,
      ).toBe(true)
      expect(result.current.hasMore).toBe(true)

      hangExtraReplay = true
      const callsBeforeInvalidate = fetchSpy.mock.calls.length
      await act(async () => {
        void queryClient.invalidateQueries(
          trpc.espressoShot.getRecent.queryFilter(),
        )
      })
      await waitFor(() =>
        expect(fetchSpy.mock.calls.length).toBeGreaterThan(
          callsBeforeInvalidate,
        ),
      )
      expect(result.current.loadingMore).toBe(false)

      let loadMoreDone: Promise<void> = Promise.resolve()
      await act(async () => {
        loadMoreDone = result.current.loadMore()
      })
      expect(result.current.loadingMore).toBe(true)

      await act(async () => {
        extraReplayReleased = true
        resolveExtraReplay(
          trpcSuccess({
            items: [{ ...extraShot, isDialedIn: false }],
            total: first.length + 2,
            nextCursor: extraBoundary,
          }),
        )
      })
      expect(result.current.loadingMore).toBe(true)

      await act(async () => {
        pageThreeReleased = true
        resolvePageThree(
          trpcSuccess({
            items: [{ ...pageThree, isDialedIn: false }],
            total: first.length + 2,
            nextCursor: null,
          }),
        )
        await loadMoreDone
      })

      await waitFor(() => {
        expect(
          result.current.items.find((shot) => shot.id === RETRY_EXTRA_ID)
            ?.isDialedIn,
        ).toBe(false)
        expect(
          result.current.items.find((shot) => shot.id === PAGE_THREE_ID)
            ?.isDialedIn,
        ).toBe(false)
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('shows retry when a same-boundary extra refresh fails after the first page succeeds', async () => {
    const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
    const extraShot = makeRecentShot({
      id: RETRY_EXTRA_ID,
      coffeeId: 'c-next',
      isDialedIn: true,
      coffee: makeRecentCoffee({ id: 'c-next', name: 'Coffee extra' }),
    })
    const boundary = espressoShotCursor(first[first.length - 1])
    let failExtraReplay = false
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input, init) => {
        const body = await requestText(input, init)
        if (body.includes(boundary)) {
          if (failExtraReplay) throw new Error('Network request failed')
          return trpcSuccess({
            items: [extraShot],
            total: first.length + 1,
            nextCursor: null,
          })
        }
        return trpcSuccess({
          items: first,
          total: first.length + 1,
          nextCursor: boundary,
        })
      },
    )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      seedEspressoShotPage(queryClient, trpc, first, first.length + 1)
      seedEspressoShotPage(
        queryClient,
        trpc,
        [extraShot],
        first.length + 1,
        boundary,
      )

      const { result } = renderHook(() => useEspressoShotPages(), {
        wrapper: Wrapper,
      })

      await act(async () => {
        await result.current.loadMore()
      })
      expect(
        result.current.items.find((shot) => shot.id === RETRY_EXTRA_ID)
          ?.isDialedIn,
      ).toBe(true)

      failExtraReplay = true
      await act(async () => {
        void queryClient.invalidateQueries(
          trpc.espressoShot.getRecent.queryFilter(),
        )
      })
      await waitFor(() =>
        expect(result.current.loadError).toBe(ESPRESSO_LOAD_FAILED),
      )
      expect(result.current.stale).toBe(true)
      expect(result.current.loadMoreError).toBeNull()
      expect(
        result.current.items.find((shot) => shot.id === RETRY_EXTRA_ID)
          ?.isDialedIn,
      ).toBe(true)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('keeps newer extra rows and cursor when an older extra refresh finishes last', async () => {
    const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
    const extraShot = makeRecentShot({
      id: RETRY_EXTRA_ID,
      coffeeId: 'c-next',
      isDialedIn: true,
      coffee: makeRecentCoffee({ id: 'c-next', name: 'Coffee extra' }),
    })
    const pageThree = makeRecentShot({
      id: PAGE_THREE_ID,
      coffeeId: 'c-three',
      isDialedIn: true,
      coffee: makeRecentCoffee({ id: 'c-three', name: 'Coffee three' }),
    })
    const boundary = espressoShotCursor(first[first.length - 1])
    const extraBoundary = espressoShotCursor(extraShot)
    let extraPage2Calls = 0
    let pageThreeReleased = false
    let resolvePageThree: (value: Response) => void = () => {}
    const pageThreePending = new Promise<Response>((resolve) => {
      resolvePageThree = resolve
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input, init) => {
        const body = await requestText(input, init)
        if (body.includes(extraBoundary)) {
          if (!pageThreeReleased) return pageThreePending
          return trpcSuccess({
            items: [{ ...pageThree, isDialedIn: false }],
            total: first.length + 2,
            nextCursor: null,
          })
        }
        if (body.includes(boundary)) {
          extraPage2Calls += 1
          return trpcSuccess({
            items: [
              {
                ...extraShot,
                isDialedIn: extraPage2Calls === 1,
              },
            ],
            total: first.length + 2,
            nextCursor: extraBoundary,
          })
        }
        return trpcSuccess({
          items: first,
          total: first.length + 2,
          nextCursor: boundary,
        })
      },
    )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      seedEspressoShotPage(queryClient, trpc, first, first.length + 2)
      seedEspressoShotPage(
        queryClient,
        trpc,
        [extraShot],
        first.length + 2,
        boundary,
        {},
        extraBoundary,
      )
      seedEspressoShotPage(
        queryClient,
        trpc,
        [pageThree],
        first.length + 2,
        extraBoundary,
      )

      const { result } = renderHook(() => useEspressoShotPages(), {
        wrapper: Wrapper,
      })

      await act(async () => {
        await result.current.loadMore()
      })
      await act(async () => {
        await result.current.loadMore()
      })
      expect(
        result.current.items.find((shot) => shot.id === RETRY_EXTRA_ID)
          ?.isDialedIn,
      ).toBe(true)
      expect(result.current.hasMore).toBe(false)

      extraPage2Calls = 0
      await act(async () => {
        void queryClient.invalidateQueries(
          trpc.espressoShot.getRecent.queryFilter(),
        )
      })
      await waitFor(() => expect(extraPage2Calls).toBe(1))

      await act(async () => {
        void queryClient.invalidateQueries(
          trpc.espressoShot.getRecent.queryFilter(),
        )
      })
      await waitFor(() => expect(extraPage2Calls).toBeGreaterThan(1))

      await act(async () => {
        pageThreeReleased = true
        resolvePageThree(
          trpcSuccess({
            items: [{ ...pageThree, isDialedIn: false }],
            total: first.length + 2,
            nextCursor: null,
          }),
        )
      })

      await waitFor(() => {
        expect(
          result.current.items.find((shot) => shot.id === RETRY_EXTRA_ID)
            ?.isDialedIn,
        ).toBe(false)
        expect(
          result.current.items.find((shot) => shot.id === PAGE_THREE_ID)
            ?.isDialedIn,
        ).toBe(false)
        expect(result.current.hasMore).toBe(false)
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('keeps newer extra rows when an older extra refresh with a different page-3 cursor finishes last', async () => {
    const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
    const extraShot = makeRecentShot({
      id: RETRY_EXTRA_ID,
      coffeeId: 'c-next',
      isDialedIn: true,
      coffee: makeRecentCoffee({ id: 'c-next', name: 'Coffee extra' }),
    })
    const extraShotForNewerCursor = makeRecentShot({
      id: 'extra-newer-cursor',
      coffeeId: 'c-next-newer',
      isDialedIn: false,
      coffee: makeRecentCoffee({
        id: 'c-next-newer',
        name: 'Coffee extra newer',
      }),
    })
    const pageThreeOlder = makeRecentShot({
      id: PAGE_THREE_ID,
      coffeeId: 'c-three',
      isDialedIn: true,
      coffee: makeRecentCoffee({ id: 'c-three', name: 'Coffee three' }),
    })
    const pageThreeNewer = makeRecentShot({
      id: 'page-three-newer',
      coffeeId: 'c-three-newer',
      isDialedIn: false,
      coffee: makeRecentCoffee({
        id: 'c-three-newer',
        name: 'Coffee three newer',
      }),
    })
    const boundary = espressoShotCursor(first[first.length - 1])
    const olderPage3Cursor = espressoShotCursor(extraShot)
    const newerPage3Cursor = espressoShotCursor(extraShotForNewerCursor)
    let replayStarted = false
    let extraReplayPage2Calls = 0
    let newerPage3Calls = 0
    let resolveOlderPage3: (value: Response) => void = () => {}
    const olderPage3Pending = new Promise<Response>((resolve) => {
      resolveOlderPage3 = resolve
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input, init) => {
        const body = await requestText(input, init)
        if (body.includes(olderPage3Cursor)) {
          if (!replayStarted) {
            return trpcSuccess({
              items: [pageThreeOlder],
              total: first.length + 2,
              nextCursor: null,
            })
          }
          return olderPage3Pending
        }
        if (body.includes(newerPage3Cursor)) {
          newerPage3Calls += 1
          return trpcSuccess({
            items: [pageThreeNewer],
            total: first.length + 2,
            nextCursor: null,
          })
        }
        if (body.includes(boundary)) {
          extraReplayPage2Calls += replayStarted ? 1 : 0
          if (!replayStarted || extraReplayPage2Calls === 1) {
            return trpcSuccess({
              items: [{ ...extraShot, isDialedIn: true }],
              total: first.length + 2,
              nextCursor: olderPage3Cursor,
            })
          }
          return trpcSuccess({
            items: [{ ...extraShot, isDialedIn: false }],
            total: first.length + 2,
            nextCursor: newerPage3Cursor,
          })
        }
        return trpcSuccess({
          items: first,
          total: first.length + 2,
          nextCursor: boundary,
        })
      },
    )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      seedEspressoShotPage(queryClient, trpc, first, first.length + 2)
      seedEspressoShotPage(
        queryClient,
        trpc,
        [extraShot],
        first.length + 2,
        boundary,
        {},
        olderPage3Cursor,
      )
      seedEspressoShotPage(
        queryClient,
        trpc,
        [pageThreeOlder],
        first.length + 2,
        olderPage3Cursor,
      )

      const { result } = renderHook(() => useEspressoShotPages(), {
        wrapper: Wrapper,
      })

      await act(async () => {
        await result.current.loadMore()
      })
      await act(async () => {
        await result.current.loadMore()
      })
      expect(
        result.current.items.find((shot) => shot.id === RETRY_EXTRA_ID)
          ?.isDialedIn,
      ).toBe(true)
      expect(
        result.current.items.find((shot) => shot.id === PAGE_THREE_ID),
      ).toBeTruthy()

      replayStarted = true
      extraReplayPage2Calls = 0
      await act(async () => {
        void queryClient.invalidateQueries(
          trpc.espressoShot.getRecent.queryFilter(),
        )
      })
      await waitFor(() => expect(extraReplayPage2Calls).toBe(1))

      await act(async () => {
        void queryClient.invalidateQueries(
          trpc.espressoShot.getRecent.queryFilter(),
        )
      })
      await waitFor(() => {
        expect(extraReplayPage2Calls).toBeGreaterThan(1)
        expect(newerPage3Calls).toBeGreaterThan(0)
        expect(
          result.current.items.find((shot) => shot.id === RETRY_EXTRA_ID)
            ?.isDialedIn,
        ).toBe(false)
        expect(
          result.current.items.find((shot) => shot.id === 'page-three-newer'),
        ).toBeTruthy()
      })

      await act(async () => {
        resolveOlderPage3(
          trpcSuccess({
            items: [{ ...pageThreeOlder, isDialedIn: true }],
            total: first.length + 2,
            nextCursor: olderPage3Cursor,
          }),
        )
      })

      await waitFor(() => {
        expect(
          result.current.items.find((shot) => shot.id === RETRY_EXTRA_ID)
            ?.isDialedIn,
        ).toBe(false)
        expect(
          result.current.items.find((shot) => shot.id === 'page-three-newer'),
        ).toBeTruthy()
        expect(
          result.current.items.find((shot) => shot.id === PAGE_THREE_ID),
        ).toBeUndefined()
        expect(result.current.hasMore).toBe(false)
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
