import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  ESPRESSO_LOAD_MORE_FAILED,
  ESPRESSO_SHOT_PAGE_SIZE,
  ESPRESSO_SHOT_Q_MAX,
  espressoShotPageInput,
  useEspressoShotPages,
} from './use-espresso-shot-pages'
import { seedEspressoShotPage } from '@/test/espresso-shots'
import { makeRecentCoffee, makeRecentShot } from '@/test/factories'
import { createTestProviders } from '@/test/providers'
import { trpcSuccess } from '@/test/trpc-response'

const FILTERED_COFFEE_ID = 'c-filtered'
const STALE_EXTRA_ID = 'stale-extra'
const RETRY_EXTRA_ID = 'retry-extra'

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
      coffee: makeRecentCoffee({ id: coffeeId, name: `${coffeeName} ${index}` }),
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
      expect(result.current.items.some((shot) => shot.id === RETRY_EXTRA_ID)).toBe(
        true,
      )
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
