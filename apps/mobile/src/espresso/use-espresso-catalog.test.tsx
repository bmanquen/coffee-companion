import { act, renderHook, waitFor } from '@testing-library/react-native'
import { useEspressoCatalog } from './use-espresso-catalog'
import type {
  EspressoApi,
  EspressoCatalog,
  ShotCreate,
  ShotCursor,
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
})
