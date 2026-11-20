import { onlineManager, useQueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { ESPRESSO_SHOT_PAGE_SIZE } from '@coffee-companion/api/lib/espresso'
import { QueryProvider } from '../query'
import { ERROR_SAVE_FAILED } from './copy'
import {
  ESPRESSO_SHOTS_QUERY_KEY,
  useEspressoCatalog,
} from './use-espresso-catalog'
import type { EspressoShotCursor } from '@coffee-companion/api/lib/espresso'
import type { ReactNode } from 'react'
import type {
  EspressoApi,
  EspressoCatalog,
  ShotCreate,
  ShotPage,
  ShotRow,
} from './types'

const USER = 'user-ada'
const COFFEE = '00000000-0000-4000-8000-000000000001'
const GRINDER = '00000000-0000-4000-8000-000000000003'
const DEVICE = '00000000-0000-4000-8000-000000000005'

function shot(overrides: Partial<ShotRow> = {}): ShotRow {
  return {
    id: 'shot-1',
    coffeeId: COFFEE,
    coffeeName: 'Ethiopia Guji',
    grinderId: GRINDER,
    brewingDeviceId: DEVICE,
    roastDate: null,
    grindSetting: '1.5',
    dose: '18',
    yield: '36',
    time: 30,
    sealed: false,
    ...overrides,
  }
}

function catalog(overrides: Partial<EspressoCatalog> = {}): EspressoCatalog {
  const shots = overrides.shots ?? [shot()]
  return {
    coffees: [{ id: COFFEE, name: 'Ethiopia Guji' }],
    grinders: [{ id: GRINDER, name: 'Niche Zero' }],
    devices: [{ id: DEVICE, name: 'Linea Mini' }],
    ...overrides,
    shots,
  }
}

const shotInput: ShotCreate = {
  coffeeId: COFFEE,
  grinderId: GRINDER,
  brewingDeviceId: DEVICE,
  roastDate: null,
  dose: '18',
  yield: '36',
  time: 30,
  grindSetting: '1.5',
  notes: null,
  idempotencyKey: '00000000-0000-4000-8000-000000000099',
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>
}

async function renderCatalog(api: EspressoApi, userId = USER) {
  return renderHook(
    ({ id }: { id: string }) => useEspressoCatalog(api, id),
    { wrapper, initialProps: { id: userId } },
  )
}

describe('useEspressoCatalog', () => {
  it('does not skip a page when load more arrives while a save refresh is resolving', async () => {
    const PAGE = ESPRESSO_SHOT_PAGE_SIZE
    const listing = Array.from({ length: PAGE * 3 }, (_, index) =>
      shot({
        id: `shot-${index + 1}`,
        coffeeName: `Shot ${index + 1}`,
      }),
    )
    const saved = shot({ id: 'shot-saved', coffeeName: 'Saved' })
    const afterSave = [saved, ...listing]
    const page1 = listing.slice(0, PAGE)
    const page2 = listing.slice(PAGE, PAGE * 2)
    const refreshed = afterSave.slice(0, PAGE)
    const afterRefresh = afterSave.slice(PAGE, PAGE * 2)
    const cursorAfter = (rows: Array<ShotRow>): EspressoShotCursor =>
      `after:${rows[rows.length - 1].id}`
    const cursorPage1 = cursorAfter(page1)
    const cursorRefreshed = cursorAfter(refreshed)
    const totalAfterSave = afterSave.length
    const listCursors: Array<EspressoShotCursor | null> = []
    let firstPageCalls = 0
    let resolveRefresh: (page: ShotPage) => void = () => {}
    const pendingRefresh = new Promise<ShotPage>((resolve) => {
      resolveRefresh = resolve
    })
    const api: EspressoApi = {
      load: () => Promise.resolve(catalog({ shots: [] })),
      listShots: (cursor) => {
        listCursors.push(cursor ?? null)
        if (cursor == null) {
          firstPageCalls += 1
          if (firstPageCalls === 1) {
            return Promise.resolve({
              items: page1,
              total: listing.length,
              nextCursor: cursorPage1,
            })
          }
          return pendingRefresh
        }
        if (cursor === cursorPage1) {
          return Promise.resolve({
            items: page2,
            total: listing.length,
            nextCursor: cursorAfter(page2),
          })
        }
        if (cursor === cursorRefreshed) {
          return Promise.resolve({
            items: afterRefresh,
            total: totalAfterSave,
            nextCursor: cursorAfter(afterRefresh),
          })
        }
        if (cursor === cursorAfter(afterRefresh)) {
          return Promise.resolve({
            items: afterSave.slice(PAGE * 2, PAGE * 3),
            total: totalAfterSave,
            nextCursor: cursorAfter(afterSave.slice(PAGE * 2, PAGE * 3)),
          })
        }
        return Promise.reject(new Error(`unexpected cursor ${cursor}`))
      },
      loadPrefill: () => Promise.resolve(null),
      create: async () => {},
    }
    const { result } = await renderCatalog(api)
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.catalog?.shots).toHaveLength(PAGE)
    })

    await act(async () => {
      result.current.loadMore()
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(result.current.catalog?.shots).toHaveLength(PAGE * 2),
    )

    await act(async () => {
      result.current.save(shotInput)
      await Promise.resolve()
    })
    expect(listCursors).toEqual([null, cursorPage1, null])

    await act(async () => {
      result.current.loadMore()
      await Promise.resolve()
    })
    expect(listCursors).toEqual([null, cursorPage1, null])

    await act(async () => {
      resolveRefresh({
        items: refreshed,
        total: totalAfterSave,
        nextCursor: cursorRefreshed,
      })
      await Promise.resolve()
      result.current.loadMore()
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(result.current.catalog?.shots[0]?.id).toBe(saved.id),
    )
    // The save re-reads only the first page.
    expect(result.current.catalog?.shots).toHaveLength(PAGE)

    // Load more pages on from the refreshed rows, so no row is skipped.
    await act(async () => {
      result.current.loadMore()
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(result.current.catalog?.shots).toHaveLength(PAGE * 2),
    )
    expect(listCursors).not.toContain(cursorAfter(page2))
    expect(result.current.catalog?.shots.map((row) => row.id)).toEqual(
      afterSave.slice(0, PAGE * 2).map((row) => row.id),
    )
    await act(async () => {
      result.current.loadMore()
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(result.current.catalog?.shots).toHaveLength(PAGE * 3),
    )
    expect(listCursors[listCursors.length - 1]).toBe(cursorAfter(afterRefresh))
    expect(result.current.catalog?.shots.map((row) => row.id)).toEqual(
      afterSave.slice(0, PAGE * 3).map((row) => row.id),
    )
  })

  it('does not page from an older refresh when a second save starts before that refresh commits', async () => {
    const PAGE = ESPRESSO_SHOT_PAGE_SIZE
    const listing = Array.from({ length: PAGE * 2 }, (_, index) =>
      shot({
        id: `shot-${index + 1}`,
        coffeeName: `Shot ${index + 1}`,
      }),
    )
    const savedFirst = shot({ id: 'shot-saved-1', coffeeName: 'Saved first' })
    const savedSecond = shot({
      id: 'shot-saved-2',
      coffeeName: 'Saved second',
    })
    const afterFirstSave = [savedFirst, ...listing]
    const afterSecondSave = [savedSecond, savedFirst, ...listing]
    const page1 = listing.slice(0, PAGE)
    const cursorAfter = (rows: Array<ShotRow>): EspressoShotCursor =>
      `after:${rows[rows.length - 1].id}`
    const cursorPage1 = cursorAfter(page1)
    const refreshedFirst = afterFirstSave.slice(0, PAGE)
    const cursorRefreshedFirst = cursorAfter(refreshedFirst)
    const refreshedSecond = afterSecondSave.slice(0, PAGE)
    const cursorRefreshedSecond = cursorAfter(refreshedSecond)
    const pageAfterSecond = afterSecondSave.slice(PAGE, PAGE * 2)
    const listCursors: Array<EspressoShotCursor | null> = []
    let firstPageCalls = 0
    let resolveFirstRefresh: (page: ShotPage) => void = () => {}
    let resolveSecondRefresh: (page: ShotPage) => void = () => {}
    const api: EspressoApi = {
      load: () => Promise.resolve(catalog({ shots: [] })),
      listShots: (cursor) => {
        listCursors.push(cursor ?? null)
        if (cursor == null) {
          firstPageCalls += 1
          if (firstPageCalls === 1) {
            return Promise.resolve({
              items: page1,
              total: listing.length,
              nextCursor: cursorPage1,
            })
          }
          if (firstPageCalls === 2) {
            return new Promise((resolve) => {
              resolveFirstRefresh = resolve
            })
          }
          return new Promise((resolve) => {
            resolveSecondRefresh = resolve
          })
        }
        if (cursor === cursorRefreshedFirst) {
          return Promise.resolve({
            items: afterFirstSave.slice(PAGE, PAGE * 2),
            total: afterFirstSave.length,
            nextCursor: null,
          })
        }
        if (cursor === cursorRefreshedSecond) {
          return Promise.resolve({
            items: pageAfterSecond,
            total: afterSecondSave.length,
            nextCursor: null,
          })
        }
        return Promise.reject(new Error(`unexpected cursor ${cursor}`))
      },
      loadPrefill: () => Promise.resolve(null),
      create: async () => {},
    }
    const { result } = await renderCatalog(api)
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.catalog?.shots).toHaveLength(PAGE)
    })

    await act(async () => {
      result.current.save(shotInput)
      await Promise.resolve()
    })

    await act(async () => {
      resolveFirstRefresh({
        items: refreshedFirst,
        total: afterFirstSave.length,
        nextCursor: cursorRefreshedFirst,
      })
      await Promise.resolve()
      // A second shot, so the API would store it rather than replay the first.
      result.current.save({
        ...shotInput,
        idempotencyKey: '00000000-0000-4000-8000-0000000000b2',
      })
      await Promise.resolve()
    })

    // No page is read while the second refresh is pending, not even with the
    // cursor from before either save.
    const cursorsBeforeBlockedLoad = [...listCursors]
    await act(async () => {
      result.current.loadMore()
      await Promise.resolve()
    })
    expect(listCursors).toEqual(cursorsBeforeBlockedLoad)

    await act(async () => {
      resolveSecondRefresh({
        items: refreshedSecond,
        total: afterSecondSave.length,
        nextCursor: cursorRefreshedSecond,
      })
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(result.current.catalog?.shots[0]?.id).toBe(savedSecond.id),
    )

    await act(async () => {
      result.current.loadMore()
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(result.current.catalog?.shots).toHaveLength(PAGE * 2),
    )
    expect(result.current.catalog?.shots.map((row) => row.id)).toEqual(
      afterSecondSave.slice(0, PAGE * 2).map((row) => row.id),
    )
  })

  it('reads only the first page again after a save, then pages on from it', async () => {
    const PAGE = ESPRESSO_SHOT_PAGE_SIZE
    const listing = Array.from({ length: PAGE * 2 }, (_, index) =>
      shot({ id: `shot-${index + 1}`, coffeeName: `Shot ${index + 1}` }),
    )
    const saved = shot({ id: 'shot-saved', coffeeName: 'Saved' })
    let rows = listing
    const listCursors: Array<EspressoShotCursor | null> = []
    const api: EspressoApi = {
      load: () => Promise.resolve(catalog({ shots: [] })),
      // Pages by the id of the row before, so a cursor from before the save
      // still lands right after it.
      listShots: (cursor) => {
        listCursors.push(cursor ?? null)
        const start = cursor
          ? rows.findIndex((row) => `after:${row.id}` === cursor) + 1
          : 0
        const items = rows.slice(start, start + PAGE)
        const more = start + PAGE < rows.length
        return Promise.resolve({
          items,
          total: rows.length,
          nextCursor: more ? `after:${items[items.length - 1].id}` : null,
        })
      },
      loadPrefill: () => Promise.resolve(null),
      create: async () => {
        rows = [saved, ...listing]
      },
    }
    const { result } = await renderCatalog(api)
    await waitFor(() =>
      expect(result.current.catalog?.shots).toHaveLength(PAGE),
    )
    await act(async () => {
      result.current.loadMore()
    })
    await waitFor(() =>
      expect(result.current.catalog?.shots).toHaveLength(PAGE * 2),
    )
    listCursors.length = 0

    await act(async () => {
      result.current.save(shotInput)
    })
    await waitFor(() =>
      expect(result.current.catalog?.shots[0]?.id).toBe(saved.id),
    )
    // One read, not one per cached page.
    expect(listCursors).toEqual([null])
    expect(result.current.catalog?.shots).toHaveLength(PAGE)

    await act(async () => {
      result.current.loadMore()
    })
    await waitFor(() =>
      expect(result.current.catalog?.shots).toHaveLength(PAGE * 2),
    )
    await act(async () => {
      result.current.loadMore()
    })
    await waitFor(() =>
      expect(result.current.catalog?.shots).toHaveLength(PAGE * 2 + 1),
    )
    expect(result.current.catalog?.shots.map((row) => row.id)).toEqual(
      [saved, ...listing].map((row) => row.id),
    )
  })

  it('keeps every loaded page when the read after a save fails', async () => {
    const PAGE = ESPRESSO_SHOT_PAGE_SIZE
    const listing = Array.from({ length: PAGE * 2 }, (_, index) =>
      shot({ id: `shot-${index + 1}`, coffeeName: `Shot ${index + 1}` }),
    )
    const saved = shot({ id: 'shot-saved', coffeeName: 'Saved' })
    let rows = listing
    let failNext = false
    const listCursors: Array<EspressoShotCursor | null> = []
    const api: EspressoApi = {
      load: () => Promise.resolve(catalog({ shots: [] })),
      listShots: (cursor) => {
        listCursors.push(cursor ?? null)
        if (failNext) {
          failNext = false
          return Promise.reject(new Error('Network request failed'))
        }
        const start = cursor
          ? rows.findIndex((row) => `after:${row.id}` === cursor) + 1
          : 0
        const items = rows.slice(start, start + PAGE)
        const more = start + PAGE < rows.length
        return Promise.resolve({
          items,
          total: rows.length,
          nextCursor: more ? `after:${items[items.length - 1].id}` : null,
        })
      },
      loadPrefill: () => Promise.resolve(null),
      create: async () => {
        rows = [saved, ...listing]
        failNext = true
      },
    }
    const { result } = await renderCatalog(api)
    await waitFor(() =>
      expect(result.current.catalog?.shots).toHaveLength(PAGE),
    )
    await act(async () => {
      result.current.loadMore()
    })
    await waitFor(() =>
      expect(result.current.catalog?.shots).toHaveLength(PAGE * 2),
    )

    await act(async () => {
      result.current.save(shotInput)
    })
    await waitFor(() => expect(result.current.loadError).not.toBeNull())
    // Both pages are still shown, and paging waits for the Retry.
    expect(result.current.catalog?.shots).toHaveLength(PAGE * 2)
    expect(result.current.hasMore).toBe(false)
    listCursors.length = 0
    await act(async () => {
      result.current.loadMore()
    })
    expect(listCursors).toEqual([])

    await act(async () => {
      result.current.reload()
    })
    await waitFor(() =>
      expect(result.current.catalog?.shots[0]?.id).toBe(saved.id),
    )
    expect(result.current.loadError).toBeNull()
    expect(result.current.catalog?.shots).toHaveLength(PAGE)
    expect(listCursors).toEqual([null])
  })

  it('drops the post-save error once a later history refetch succeeds', async () => {
    const saved = shot({ id: 'shot-saved', coffeeName: 'Saved' })
    let rows = [shot({ id: 'shot-1', coffeeName: 'Shot 1' })]
    let failNext = false
    const api: EspressoApi = {
      load: () => Promise.resolve(catalog({ shots: [] })),
      listShots: () => {
        if (failNext) {
          failNext = false
          return Promise.reject(new Error('Network request failed'))
        }
        return Promise.resolve({
          items: rows,
          total: rows.length,
          nextCursor: null,
        })
      },
      loadPrefill: () => Promise.resolve(null),
      create: async () => {
        rows = [saved, ...rows]
        failNext = true
      },
    }
    const { result } = await renderHook(
      () => ({
        catalog: useEspressoCatalog(api, USER),
        client: useQueryClient(),
      }),
      { wrapper },
    )
    await waitFor(() =>
      expect(result.current.catalog.catalog?.shots).toHaveLength(1),
    )
    await act(async () => {
      result.current.catalog.save(shotInput)
    })
    await waitFor(() => expect(result.current.catalog.loadError).not.toBeNull())

    // A focus or reconnect refetch, not Retry, brings the saved shot.
    await act(async () => {
      await result.current.client.invalidateQueries({
        queryKey: [ESPRESSO_SHOTS_QUERY_KEY, USER],
      })
    })
    await waitFor(() =>
      expect(result.current.catalog.catalog?.shots[0]?.id).toBe(saved.id),
    )
    expect(result.current.catalog.loadError).toBeNull()
  })

  it('is loading, not empty, while the first shot’s history read is out', async () => {
    let reads = 0
    const api: EspressoApi = {
      load: () => Promise.resolve(catalog({ shots: [] })),
      listShots: () => {
        reads += 1
        return reads === 1
          ? Promise.resolve({ items: [], total: 0, nextCursor: null })
          : new Promise(() => {})
      },
      loadPrefill: () => Promise.resolve(null),
      create: async () => {},
    }
    const { result } = await renderCatalog(api)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.catalog?.shots).toEqual([])

    await act(async () => {
      result.current.save(shotInput)
    })
    await waitFor(() => expect(reads).toBe(2))
    expect(result.current.loading).toBe(true)
  })

  it('stops loading when a save lands before the first history read and its read fails', async () => {
    let reads = 0
    const api: EspressoApi = {
      load: () => Promise.resolve(catalog({ shots: [] })),
      listShots: () => {
        reads += 1
        return reads === 1
          ? new Promise(() => {})
          : Promise.reject(new Error('Network request failed'))
      },
      loadPrefill: () => Promise.resolve(null),
      create: async () => {},
    }
    const { result } = await renderCatalog(api)
    await waitFor(() => expect(reads).toBe(1))

    await act(async () => {
      result.current.save(shotInput)
    })
    await waitFor(() => expect(result.current.loadError).not.toBeNull())
    // The Retry banner shows on its own, not over a spinner that never ends.
    expect(result.current.loading).toBe(false)
  })

  it('is loading, not empty, while an empty history read is paused offline', async () => {
    const api: EspressoApi = {
      load: () => Promise.resolve(catalog({ shots: [] })),
      listShots: () =>
        Promise.resolve({ items: [], total: 0, nextCursor: null }),
      loadPrefill: () => Promise.resolve(null),
      create: async () => {},
    }
    const { result } = await renderHook(
      () => ({
        catalog: useEspressoCatalog(api, USER),
        client: useQueryClient(),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.catalog.loading).toBe(false))
    expect(result.current.catalog.catalog?.shots).toEqual([])
    onlineManager.setOnline(false)
    try {
      await act(async () => {
        void result.current.client.invalidateQueries({
          queryKey: [ESPRESSO_SHOTS_QUERY_KEY, USER],
        })
      })
      // Offline, the read pauses: neither pending nor fetching.
      expect(result.current.catalog.loading).toBe(true)
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it('aborts a history read when a save cancels it', async () => {
    const signals: Array<AbortSignal | undefined> = []
    let reads = 0
    const api: EspressoApi = {
      load: () => Promise.resolve(catalog({ shots: [] })),
      listShots: (_cursor, signal) => {
        reads += 1
        signals.push(signal)
        // The first read loads; the second, the first save's refresh, hangs.
        if (reads === 1) {
          return Promise.resolve({
            items: [shot()],
            total: 1,
            nextCursor: null,
          })
        }
        if (reads === 2) return new Promise(() => {})
        return Promise.resolve({ items: [shot()], total: 1, nextCursor: null })
      },
      loadPrefill: () => Promise.resolve(null),
      create: async () => {},
    }
    const { result } = await renderCatalog(api)
    await waitFor(() => expect(result.current.catalog?.shots).toHaveLength(1))
    await act(async () => {
      result.current.save(shotInput)
    })
    await waitFor(() => expect(reads).toBe(2))
    expect(signals[1]?.aborted).toBe(false)
    // A second shot cancels that refresh for its own.
    await act(async () => {
      result.current.save({
        ...shotInput,
        idempotencyKey: '00000000-0000-4000-8000-0000000000c3',
      })
    })
    await waitFor(() => expect(reads).toBe(3))
    expect(signals[1]?.aborted).toBe(true)
  })

  it('reads the shots again after a save when the only read in flight started before it', async () => {
    const saved = shot({ id: 'shot-saved', coffeeName: 'Saved' })
    let resolveStale: (page: ShotPage) => void = () => {}
    const stale = new Promise<ShotPage>((resolve) => {
      resolveStale = resolve
    })
    let listCalls = 0
    const api: EspressoApi = {
      load: () => Promise.resolve(catalog({ shots: [] })),
      listShots: () => {
        listCalls += 1
        if (listCalls === 1) return stale
        return Promise.resolve({ items: [saved], total: 1, nextCursor: null })
      },
      loadPrefill: () => Promise.resolve(null),
      create: async () => {},
    }
    const { result } = await renderCatalog(api)
    await waitFor(() => expect(result.current.catalog).not.toBeNull())

    await act(async () => {
      result.current.save(shotInput)
      await Promise.resolve()
    })
    // The fresh read does not wait for the one started before the save.
    await waitFor(() =>
      expect(result.current.catalog?.shots.map((row) => row.id)).toEqual([
        saved.id,
      ]),
    )
    expect(listCalls).toBe(2)

    await act(async () => {
      resolveStale({ items: [], total: 0, nextCursor: null })
      await Promise.resolve()
    })
    expect(result.current.catalog?.shots.map((row) => row.id)).toEqual([
      saved.id,
    ])
    expect(listCalls).toBe(2)
  })

  it('reports a save that fails while offline instead of staying busy', async () => {
    const create = jest.fn(() => Promise.reject(new TypeError('Network request failed')))
    const api: EspressoApi = {
      load: () => Promise.resolve(catalog()),
      listShots: () => Promise.resolve({ items: [shot()], total: 1, nextCursor: null }),
      loadPrefill: () => Promise.resolve(null),
      create,
    }
    const { result } = await renderCatalog(api)
    await waitFor(() => expect(result.current.loading).toBe(false))

    onlineManager.setOnline(false)
    try {
      await act(async () => {
        result.current.save(shotInput)
        await Promise.resolve()
      })
      await waitFor(() => expect(result.current.saveError).toBe(ERROR_SAVE_FAILED))
      expect(result.current.busy).toBe(false)
      expect(create).toHaveBeenCalledTimes(1)
    } finally {
      onlineManager.setOnline(true)
    }
  })
})
