import { act, renderHook, waitFor } from '@testing-library/react-native'
import { ESPRESSO_SHOT_PAGE_SIZE } from '@coffee-companion/api/lib/espresso'
import { QueryProvider } from '../query'
import { useEspressoCatalog } from './use-espresso-catalog'
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
    await waitFor(() =>
      expect(result.current.catalog?.shots).toHaveLength(PAGE * 2),
    )
    expect(result.current.catalog?.shots.map((row) => row.id)).toEqual(
      afterSave.slice(0, PAGE * 2).map((row) => row.id),
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
})
