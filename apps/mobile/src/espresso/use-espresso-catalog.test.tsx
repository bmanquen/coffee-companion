import { act, renderHook, waitFor } from '@testing-library/react-native'
import { useEspressoCatalog } from './use-espresso-catalog'
import { SHOT_PAGE_SIZE } from './types'
import type {
  EspressoApi,
  EspressoCatalog,
  ShotCreate,
  ShotCursor,
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
    nextCursor: null,
    ...overrides,
    shots,
    total: overrides.total ?? shots.length,
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

const ADA = 'user-ada'
const ALAN = 'user-alan'

describe('useEspressoCatalog', () => {
  it('keeps a pending full load when a refresh succeeds before any catalog exists', async () => {
    let resolveLoad: (value: EspressoCatalog) => void = () => {}
    const api: EspressoApi = {
      load: () =>
        new Promise((resolve) => {
          resolveLoad = resolve
        }),
      listShots: () =>
        Promise.resolve({
          items: [shot({ id: 'shot-refresh', coffeeName: 'From refresh' })],
          total: 1,
          nextCursor: null,
        }),
      loadPrefill: () => Promise.resolve(null),
      create: async () => {},
    }
    const { result } = await renderHook(() => useEspressoCatalog(api, USER))
    expect(result.current.loading).toBe(true)
    expect(result.current.catalog).toBeNull()

    await act(async () => {
      result.current.save(shotInput)
      await Promise.resolve()
    })

    await act(async () => {
      resolveLoad(catalog({ shots: [shot({ coffeeName: 'From load' })] }))
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.catalog).toBeTruthy())
    expect(result.current.catalog?.shots[0]?.coffeeName).toBe('From load')
    expect(result.current.loading).toBe(false)
  })

  it('discards a full load that settles after a later refresh', async () => {
    let resolveReload: (value: EspressoCatalog) => void = () => {}
    let loads = 0
    const api: EspressoApi = {
      load: () => {
        loads += 1
        if (loads === 1) {
          return Promise.resolve(
            catalog({ shots: [shot({ coffeeName: 'Initial' })] }),
          )
        }
        return new Promise((resolve) => {
          resolveReload = resolve
        })
      },
      listShots: () =>
        Promise.resolve({
          items: [shot({ id: 'shot-refresh', coffeeName: 'Refreshed' })],
          total: 1,
          nextCursor: null,
        }),
      loadPrefill: () => Promise.resolve(null),
      create: async () => {},
    }
    const { result } = await renderHook(() => useEspressoCatalog(api, USER))
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.catalog?.shots[0]?.coffeeName).toBe('Initial')
    })

    await act(async () => {
      result.current.reload()
      await Promise.resolve()
    })

    await act(async () => {
      result.current.save(shotInput)
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(result.current.catalog?.shots[0]?.coffeeName).toBe('Refreshed'),
    )
    expect(result.current.loading).toBe(false)

    await act(async () => {
      resolveReload(catalog({ shots: [shot({ coffeeName: 'Stale load' })] }))
      await Promise.resolve()
    })
    expect(result.current.catalog?.shots[0]?.coffeeName).toBe('Refreshed')
    expect(result.current.loadError).toBeNull()
  })

  it('discards a full load failure that settles after a later refresh', async () => {
    let rejectReload: (error: Error) => void = () => {}
    let loads = 0
    const api: EspressoApi = {
      load: () => {
        loads += 1
        if (loads === 1) {
          return Promise.resolve(
            catalog({ shots: [shot({ coffeeName: 'Initial' })] }),
          )
        }
        return new Promise((_, reject) => {
          rejectReload = reject
        })
      },
      listShots: () =>
        Promise.resolve({
          items: [shot({ id: 'shot-refresh', coffeeName: 'Refreshed' })],
          total: 1,
          nextCursor: null,
        }),
      loadPrefill: () => Promise.resolve(null),
      create: async () => {},
    }
    const { result } = await renderHook(() => useEspressoCatalog(api, USER))
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.catalog?.shots[0]?.coffeeName).toBe('Initial')
    })

    await act(async () => {
      result.current.reload()
      await Promise.resolve()
    })
    await act(async () => {
      result.current.save(shotInput)
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(result.current.catalog?.shots[0]?.coffeeName).toBe('Refreshed'),
    )

    await act(async () => {
      rejectReload(new Error('Network request failed'))
      await Promise.resolve()
    })
    expect(result.current.catalog?.shots[0]?.coffeeName).toBe('Refreshed')
    expect(result.current.loadError).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('discards a late first-page refresh after a newer full load', async () => {
    const NEXT_CURSOR: ShotCursor = 'after:shot-1'
    let resolveRefresh:
      | ((page: {
          items: Array<ShotRow>
          total: number
          nextCursor: ShotCursor | null
        }) => void)
      | null = null
    let loads = 0
    const listCursors: Array<ShotCursor | null | undefined> = []
    const api: EspressoApi = {
      load: () => {
        loads += 1
        if (loads === 1) {
          return Promise.resolve(
            catalog({
              shots: [shot({ coffeeName: 'Initial' })],
              total: 2,
              nextCursor: NEXT_CURSOR,
            }),
          )
        }
        return Promise.resolve(
          catalog({
            shots: [shot({ id: 'shot-reload', coffeeName: 'Reloaded' })],
            total: 2,
            nextCursor: NEXT_CURSOR,
          }),
        )
      },
      listShots: (cursor) => {
        listCursors.push(cursor)
        if (!cursor) {
          return new Promise((resolve) => {
            resolveRefresh = resolve
          })
        }
        return Promise.resolve({
          items: [shot({ id: 'shot-more', coffeeName: 'Page two' })],
          total: 2,
          nextCursor: null,
        })
      },
      loadPrefill: () => Promise.resolve(null),
      create: async () => {},
    }
    const { result } = await renderHook(() => useEspressoCatalog(api, USER))
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.catalog?.shots[0]?.coffeeName).toBe('Initial')
    })

    await act(async () => {
      result.current.save(shotInput)
      await Promise.resolve()
    })
    expect(listCursors).toEqual([undefined])

    await act(async () => {
      result.current.reload()
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(result.current.catalog?.shots[0]?.coffeeName).toBe('Reloaded'),
    )
    expect(result.current.loading).toBe(false)

    await act(async () => {
      result.current.loadMore()
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(
        result.current.catalog?.shots.some((row) => row.coffeeName === 'Page two'),
      ).toBe(true),
    )
    expect(listCursors).toEqual([undefined, NEXT_CURSOR])

    await act(async () => {
      resolveRefresh?.({
        items: [shot({ id: 'shot-stale', coffeeName: 'Stale refresh' })],
        total: 1,
        nextCursor: null,
      })
      await Promise.resolve()
    })
    expect(result.current.catalog?.shots.map((row) => row.coffeeName)).toEqual([
      'Reloaded',
      'Page two',
    ])
    expect(result.current.loading).toBe(false)
  })

  it('does not apply a save that started before the signed-in user changed and changed back', async () => {
    let resolveCreate: () => void = () => {}
    const pending = new Promise<void>((resolve) => {
      resolveCreate = resolve
    })
    const listCursors: Array<ShotCursor | null | undefined> = []
    const api: EspressoApi = {
      load: () =>
        Promise.resolve(catalog({ shots: [shot({ coffeeName: 'House' })] })),
      listShots: (cursor) => {
        listCursors.push(cursor)
        return Promise.resolve({
          items: [shot({ id: 'shot-refresh', coffeeName: 'From save' })],
          total: 1,
          nextCursor: null,
        })
      },
      loadPrefill: () => Promise.resolve(null),
      create: () => pending,
    }
    const onSuccess = jest.fn()
    const { result, rerender } = await renderHook(
      ({ userId }: { userId: string }) => useEspressoCatalog(api, userId),
      { initialProps: { userId: ADA } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.save(shotInput, onSuccess)
      await Promise.resolve()
    })
    expect(result.current.busy).toBe(true)

    await act(async () => {
      rerender({ userId: ALAN })
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      rerender({ userId: ADA })
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const listsAfterReturn = listCursors.length

    await act(async () => {
      resolveCreate()
      await pending
      await Promise.resolve()
    })

    expect(onSuccess).not.toHaveBeenCalled()
    expect(listCursors).toHaveLength(listsAfterReturn)
    expect(result.current.catalog?.shots[0]?.coffeeName).toBe('House')
    expect(result.current.busy).toBe(false)
    expect(result.current.saveError).toBeNull()
  })

  it('does not skip a page when load more arrives while a save refresh is resolving', async () => {
    const PAGE = SHOT_PAGE_SIZE
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
    const page3 = listing.slice(PAGE * 2)
    const refreshed = afterSave.slice(0, PAGE)
    const afterRefresh = afterSave.slice(PAGE, PAGE * 2)
    const cursorAfter = (rows: Array<ShotRow>): ShotCursor =>
      `after:${rows[rows.length - 1].id}`
    const cursorPage1 = cursorAfter(page1)
    const cursorPage2 = cursorAfter(page2)
    const cursorRefreshed = cursorAfter(refreshed)
    const totalAfterSave = afterSave.length
    const listCursors: Array<ShotCursor | null> = []
    let resolveRefresh: (page: ShotPage) => void = () => {}
    const pendingRefresh = new Promise<ShotPage>((resolve) => {
      resolveRefresh = resolve
    })
    const api: EspressoApi = {
      load: () =>
        Promise.resolve(
          catalog({
            shots: page1,
            total: listing.length,
            nextCursor: cursorPage1,
          }),
        ),
      listShots: (cursor) => {
        listCursors.push(cursor ?? null)
        if (cursor == null) return pendingRefresh
        if (cursor === cursorPage1) {
          return Promise.resolve({
            items: page2,
            total: listing.length,
            nextCursor: cursorPage2,
          })
        }
        if (cursor === cursorPage2) {
          return Promise.resolve({
            items: page3,
            total: listing.length,
            nextCursor: null,
          })
        }
        if (cursor === cursorRefreshed) {
          return Promise.resolve({
            items: afterRefresh,
            total: totalAfterSave,
            nextCursor: cursorAfter(afterRefresh),
          })
        }
        return Promise.reject(new Error(`unexpected cursor ${cursor}`))
      },
      loadPrefill: () => Promise.resolve(null),
      create: async () => {},
    }
    const { result } = await renderHook(() => useEspressoCatalog(api, USER))
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
    expect(listCursors).toEqual([cursorPage1, null])

    await act(async () => {
      result.current.loadMore()
      await Promise.resolve()
    })
    expect(listCursors).toEqual([cursorPage1, null])

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
    const ids = result.current.catalog?.shots.map((row) => row.id) ?? []
    expect(ids).toEqual(afterSave.slice(0, ids.length).map((row) => row.id))
    expect(ids).not.toContain(page3[0].id)

    await act(async () => {
      result.current.loadMore()
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(result.current.catalog?.shots).toHaveLength(PAGE * 2),
    )
    expect(result.current.catalog?.shots.map((row) => row.id)).toEqual(
      afterSave.slice(0, PAGE * 2).map((row) => row.id),
    )
  })

  it('does not page from an older refresh when a second save starts before that refresh commits', async () => {
    const PAGE = SHOT_PAGE_SIZE
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
    const cursorAfter = (rows: Array<ShotRow>): ShotCursor =>
      `after:${rows[rows.length - 1].id}`
    const cursorPage1 = cursorAfter(page1)
    const refreshedFirst = afterFirstSave.slice(0, PAGE)
    const cursorRefreshedFirst = cursorAfter(refreshedFirst)
    const pageAfterFirst = afterFirstSave.slice(PAGE, PAGE * 2)
    const refreshedSecond = afterSecondSave.slice(0, PAGE)
    const cursorRefreshedSecond = cursorAfter(refreshedSecond)
    const pageAfterSecond = afterSecondSave.slice(PAGE, PAGE * 2)
    const listCursors: Array<ShotCursor | null> = []
    let firstPageCalls = 0
    let resolveFirstRefresh: (page: ShotPage) => void = () => {}
    let resolveSecondRefresh: (page: ShotPage) => void = () => {}
    const api: EspressoApi = {
      load: () =>
        Promise.resolve(
          catalog({
            shots: page1,
            total: listing.length,
            nextCursor: cursorPage1,
          }),
        ),
      listShots: (cursor) => {
        listCursors.push(cursor ?? null)
        if (cursor == null) {
          firstPageCalls += 1
          if (firstPageCalls === 1) {
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
            items: pageAfterFirst,
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
    const { result } = await renderHook(() => useEspressoCatalog(api, USER))
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
      result.current.save(shotInput)
      await Promise.resolve()
    })

    await act(async () => {
      result.current.loadMore()
      await Promise.resolve()
    })
    expect(listCursors).not.toContain(cursorRefreshedFirst)

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

  it('does not apply an older refresh that settles after a newer save has started', async () => {
    const PAGE = SHOT_PAGE_SIZE
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
    const cursorAfter = (rows: Array<ShotRow>): ShotCursor =>
      `after:${rows[rows.length - 1].id}`
    const cursorPage1 = cursorAfter(page1)
    const refreshedFirst = afterFirstSave.slice(0, PAGE)
    const cursorRefreshedFirst = cursorAfter(refreshedFirst)
    const refreshedSecond = afterSecondSave.slice(0, PAGE)
    const cursorRefreshedSecond = cursorAfter(refreshedSecond)
    const pageAfterSecond = afterSecondSave.slice(PAGE, PAGE * 2)
    const listCursors: Array<ShotCursor | null> = []
    let firstPageCalls = 0
    let resolveFirstRefresh: (page: ShotPage) => void = () => {}
    let resolveSecondRefresh: (page: ShotPage) => void = () => {}
    const api: EspressoApi = {
      load: () =>
        Promise.resolve(
          catalog({
            shots: page1,
            total: listing.length,
            nextCursor: cursorPage1,
          }),
        ),
      listShots: (cursor) => {
        listCursors.push(cursor ?? null)
        if (cursor == null) {
          firstPageCalls += 1
          if (firstPageCalls === 1) {
            return new Promise((resolve) => {
              resolveFirstRefresh = resolve
            })
          }
          return new Promise((resolve) => {
            resolveSecondRefresh = resolve
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
    const { result } = await renderHook(() => useEspressoCatalog(api, USER))
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.catalog?.shots).toHaveLength(PAGE)
    })

    await act(async () => {
      result.current.save(shotInput)
      await Promise.resolve()
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
    })
    expect(result.current.catalog?.shots.map((row) => row.id)).toEqual(
      page1.map((row) => row.id),
    )

    await act(async () => {
      result.current.loadMore()
      await Promise.resolve()
    })
    expect(listCursors).toEqual([null, null])

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
})
