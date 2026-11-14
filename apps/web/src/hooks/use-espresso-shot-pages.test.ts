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
const RETRY_EXTRA_ID = 'retry-extra'
const KEPT_EXTRA_ID = 'kept-extra'
const REMOVED_EXTRA_ID = 'removed-extra'
const REFRESHED_FIRST_ID = 'refreshed-0'
const NEWLY_MATCHING_ID = 'newly-matching'

async function requestText(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<string> {
  if (input instanceof Request) return input.clone().text()
  return String(init?.body ?? input)
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
    expect(espressoShotPageInput({ q }).q).toHaveLength(ESPRESSO_SHOT_Q_MAX)
  })

  it('omits blank q and uses the shared page size', () => {
    expect(espressoShotPageInput()).toEqual({ limit: ESPRESSO_SHOT_PAGE_SIZE })
    expect(espressoShotPageInput({ q: '   ' })).toEqual({
      limit: ESPRESSO_SHOT_PAGE_SIZE,
    })
  })

  it('passes dialedIn when the filter is on', () => {
    expect(espressoShotPageInput({ dialedIn: true })).toEqual({
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
                id: 'stale-extra',
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
      await waitFor(() =>
        expect(result.current.loadMoreError).toBe(ESPRESSO_LOAD_MORE_FAILED),
      )

      await act(async () => {
        await result.current.loadMore()
      })
      await waitFor(() => {
        expect(result.current.loadMoreError).toBeNull()
        expect(
          result.current.items.some((shot) => shot.id === RETRY_EXTRA_ID),
        ).toBe(true)
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('keeps extra shots when a refetch fails', async () => {
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

  it('keeps extra shots when a refetch keeps the same cursor boundary', async () => {
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

  it('drops extra shots after a successful refetch whose first page has no next page', async () => {
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

    act(() => {
      result.current.removeShot(REMOVED_EXTRA_ID)
    })

    await waitFor(() => {
      const ids = result.current.items.map((shot) => shot.id)
      expect(ids).toContain(KEPT_EXTRA_ID)
      expect(ids).not.toContain(REMOVED_EXTRA_ID)
      expect(ids).toHaveLength(ESPRESSO_SHOT_PAGE_SIZE + 1)
    })
  })

  it('refreshes extra-row dialed-in after a refetch', async () => {
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
      expect(
        result.current.items.find((shot) => shot.id === RETRY_EXTRA_ID)
          ?.isDialedIn,
      ).toBe(true)

      await act(async () => {
        await queryClient.invalidateQueries(
          trpc.espressoShot.getRecent.infiniteQueryFilter(),
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

  it('shows later matches after an empty extra page is refetched', async () => {
    const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
    const newlyMatching = makeRecentShot({
      id: NEWLY_MATCHING_ID,
      coffeeId: 'c-late',
      coffee: makeRecentCoffee({ id: 'c-late', name: 'Coffee late' }),
    })
    const boundary = espressoShotCursor(first[first.length - 1])
    let extraEmpty = true
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input, init) => {
        const body = await requestText(input, init)
        if (body.includes(boundary)) {
          if (extraEmpty) {
            return trpcSuccess({
              items: [],
              total: first.length,
              nextCursor: null,
            })
          }
          return trpcSuccess({
            items: [newlyMatching],
            total: first.length + 1,
            nextCursor: null,
          })
        }
        return trpcSuccess({
          items: first,
          total: extraEmpty ? first.length : first.length + 1,
          nextCursor: boundary,
        })
      },
    )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      seedEspressoShotPage(queryClient, trpc, first, first.length + 1)

      const { result } = renderHook(() => useEspressoShotPages(), {
        wrapper: Wrapper,
      })
      expect(result.current.hasMore).toBe(true)

      await act(async () => {
        await result.current.loadMore()
      })
      await waitFor(() => expect(result.current.hasMore).toBe(false))

      extraEmpty = false
      await act(async () => {
        await result.current.retry()
      })
      await waitFor(() =>
        expect(
          result.current.items.some((shot) => shot.id === NEWLY_MATCHING_ID),
        ).toBe(true),
      )
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('keeps extra rows after a refetch that still has them', async () => {
    const first = pageOf(ESPRESSO_SHOT_PAGE_SIZE, 's')
    const extraShot = makeRecentShot({
      id: RETRY_EXTRA_ID,
      coffeeId: 'c-next',
      coffee: makeRecentCoffee({ id: 'c-next', name: 'Coffee extra' }),
    })
    const boundary = espressoShotCursor(first[first.length - 1])
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input, init) => {
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
        null,
      )

      const { result } = renderHook(() => useEspressoShotPages(), {
        wrapper: Wrapper,
      })
      expect(
        result.current.items.some((shot) => shot.id === RETRY_EXTRA_ID),
      ).toBe(true)
      expect(result.current.hasMore).toBe(false)

      await act(async () => {
        await result.current.retry()
      })
      await waitFor(() => {
        expect(
          result.current.items.some((shot) => shot.id === RETRY_EXTRA_ID),
        ).toBe(true)
        expect(result.current.hasMore).toBe(false)
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
