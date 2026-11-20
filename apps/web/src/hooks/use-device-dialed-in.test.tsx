import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createTestProviders } from '@/test/providers'
import { trpcSuccess } from '@/test/trpc-response'
import { useDeviceDialedIn } from './use-device-dialed-in'
import { espressoShotInfiniteOptions } from './use-espresso-shot-pages'

describe('useDeviceDialedIn', () => {
  it('keeps an espresso page fetched before a toggle stale once it lands', async () => {
    let finishPage: (response: Response) => void = () => {}
    const fetch = vi.fn<typeof globalThis.fetch>((input) =>
      String(input).includes('espressoShot.getRecent')
        ? new Promise<Response>((resolve) => {
            finishPage = resolve
          })
        : Promise.resolve(trpcSuccess({})),
    )
    const { queryClient, trpc, Wrapper } = createTestProviders({ fetch })
    // A filtered page left mid-load, so no screen observes it any more.
    const page = espressoShotInfiniteOptions(trpc, { coffeeId: 'c1' })
    const prefetched = queryClient.prefetchInfiniteQuery(page)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    const { result } = renderHook(() => useDeviceDialedIn('espresso'), {
      wrapper: Wrapper,
    })
    act(() => {
      result.current.toggle({
        id: 's1',
        brewingDeviceId: 'd1',
        isDialedIn: true,
      })
    })
    await waitFor(() =>
      expect(queryClient.getQueryState(page.queryKey)?.isInvalidated).toBe(
        true,
      ),
    )

    // The page's response was read before the toggle.
    await act(async () => {
      finishPage(trpcSuccess({ items: [], total: 0, nextCursor: null }))
      await prefetched
    })
    expect(queryClient.getQueryState(page.queryKey)?.isInvalidated).toBe(true)
  })

  it('leaves a shot form’s prefill lookup running through a toggle', async () => {
    let finishLatest: (response: Response) => void = () => {}
    const fetch = vi.fn<typeof globalThis.fetch>((input) =>
      String(input).includes('espressoShot.getLatestUnsealed')
        ? new Promise<Response>((resolve) => {
            finishLatest = resolve
          })
        : Promise.resolve(trpcSuccess({})),
    )
    const { queryClient, trpc, Wrapper } = createTestProviders({ fetch })
    // The form reads it with fetchQuery, so nothing would restart it.
    const lookup = queryClient.fetchQuery(
      trpc.espressoShot.getLatestUnsealed.queryOptions({ coffeeId: 'c1' }),
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    const { result } = renderHook(() => useDeviceDialedIn('espresso'), {
      wrapper: Wrapper,
    })
    act(() => {
      result.current.toggle({
        id: 's1',
        brewingDeviceId: 'd1',
        isDialedIn: true,
      })
    })
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([input]) =>
          String(input).includes('dialedInBrew'),
        ),
      ).toBe(true),
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    await act(async () => {
      finishLatest(trpcSuccess(null))
    })
    await expect(lookup).resolves.toBeNull()
  })
})
