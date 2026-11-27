import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SignedInHome } from '../auth/SignedInHome'
import { writeHostTreeArtifacts } from '../test/host-tree'
import { CoffeeDetail } from './CoffeeDetail'
import {
  BREW_ROW_TEST_ID_PREFIX,
  BREW_SUMMARY_TEST_ID,
  COFFEE_DETAIL_BACK_TEST_ID,
  COFFEE_DETAIL_TEST_ID,
  COFFEE_LIST_TEST_ID,
  COFFEE_ROW_TEST_ID_PREFIX,
  COFFEE_SEARCH_TEST_ID,
  DIALED_IN,
  EMPTY_COFFEES,
  ERROR_LOAD_BREWS,
  NO_MATCHING_COFFEES,
  SEALED_BREW,
  TAB_COFFEES_TEST_ID,
  TAB_ESPRESSO_TEST_ID,
} from './copy'
import type { BrewRow, CoffeeRow, CoffeesApi } from './types'

const GUJI = 'coffee-guji'
const LINTONG = 'coffee-lintong'
const CERRADO = 'coffee-cerrado'

const place = (name: string) => ({ name })

const COFFEES: Array<CoffeeRow> = [
  {
    id: GUJI,
    name: 'Ethiopia Guji',
    notes: 'Bergamot and stone fruit',
    roaster: place('Sey'),
    roastLevel: place('Light'),
    origins: [
      {
        country: place('Ethiopia'),
        region: place('Guji'),
        process: place('Washed'),
      },
    ],
    varieties: [place('Heirloom')],
    isDialedIn: true,
  },
  {
    id: LINTONG,
    name: 'Sumatra Lintong',
    notes: null,
    roaster: null,
    roastLevel: place('Dark'),
    origins: [
      {
        country: place('Indonesia'),
        region: place('Lintong'),
        process: place('Wet-Hulled'),
      },
    ],
    varieties: [place('Typica'), null],
    isDialedIn: false,
  },
  {
    id: CERRADO,
    name: 'Brazil Cerrado',
    notes: 'Chocolate',
    roaster: place('Onyx'),
    roastLevel: null,
    origins: [
      {
        country: place('Brazil'),
        region: place('Cerrado'),
        process: place('Natural'),
      },
    ],
    varieties: [place('Bourbon')],
    isDialedIn: false,
  },
]

function brew(overrides: Partial<BrewRow>): BrewRow {
  return {
    id: 'brew',
    method: 'Espresso',
    createdAt: new Date('2026-11-20T12:00:00Z'),
    sealed: false,
    isDialedIn: false,
    grindSetting: null,
    dose: null,
    output: null,
    time: null,
    ...overrides,
  }
}

// What the server sends for Sumatra Lintong on Free: a Sealed Shot with its
// settings blanked, and a readable Pour Over.
const LINTONG_BREWS: Array<BrewRow> = [
  brew({
    id: 'pour-1',
    method: 'Pour Over',
    createdAt: new Date('2026-11-25T12:00:00Z'),
    grindSetting: '24',
    dose: '15',
    output: '250',
    time: 165,
  }),
  brew({ id: 'shot-sealed', method: 'Espresso', sealed: true }),
  brew({
    id: 'cold-1',
    method: 'Cold Brew',
    createdAt: new Date('2026-11-10T12:00:00Z'),
    dose: '100',
    output: '1000',
    time: 1080,
    isDialedIn: true,
  }),
  brew({
    id: 'cold-0',
    method: 'Cold Brew',
    createdAt: new Date('2026-11-09T12:00:00Z'),
    time: 0,
  }),
]

function fakeApi(overrides: Partial<CoffeesApi> = {}) {
  const listBrews = jest.fn((coffeeId: string) =>
    Promise.resolve(coffeeId === LINTONG ? LINTONG_BREWS : []),
  )
  const api: CoffeesApi = {
    list: () => Promise.resolve(COFFEES),
    listBrews,
    ...overrides,
  }
  return { api, listBrews }
}

async function renderHome(api: CoffeesApi) {
  return await render(
    <SignedInHome
      name="Ada Lovelace"
      userId="user-ada"
      onSignOut={() => {}}
      coffees={api}
    />,
  )
}

async function openCoffeesTab() {
  await fireEvent.press(screen.getByTestId(TAB_COFFEES_TEST_ID))
  await screen.findByTestId(`${COFFEE_ROW_TEST_ID_PREFIX}${GUJI}`)
}

function visibleCoffeeIds() {
  return screen
    .queryAllByTestId(new RegExp(`^${COFFEE_ROW_TEST_ID_PREFIX}`))
    .map((row) =>
      String(row.props.testID).slice(COFFEE_ROW_TEST_ID_PREFIX.length),
    )
}

describe('Coffees', () => {
  it('lists every Coffee with its roaster and origin', async () => {
    await renderHome(fakeApi().api)
    await openCoffeesTab()

    expect(visibleCoffeeIds()).toEqual([GUJI, LINTONG, CERRADO])
    const guji = screen.getByTestId(`${COFFEE_ROW_TEST_ID_PREFIX}${GUJI}`)
    expect(within(guji).getByText('Sey')).toBeTruthy()
    expect(within(guji).getByText('Ethiopia, Guji')).toBeTruthy()
  })

  it.each([
    ['name', 'guji', [GUJI]],
    ['roaster', 'ONYX', [CERRADO]],
    ['roast level', 'dark', [LINTONG]],
    ['country', 'indonesia', [LINTONG]],
    ['region', 'cerrado', [CERRADO]],
    ['process', 'wet-hulled', [LINTONG]],
    ['variety', 'bourbon', [CERRADO]],
    ['notes', 'bergamot', [GUJI]],
    ['a term two Coffees share', 'IA', [GUJI, LINTONG]],
  ])('searches by %s', async (_field, query, expected) => {
    await renderHome(fakeApi().api)
    await openCoffeesTab()

    await fireEvent.changeText(screen.getByTestId(COFFEE_SEARCH_TEST_ID), query)

    expect(visibleCoffeeIds()).toEqual(expected)
  })

  it("never matches a Coffee's Brews, so Sealed settings cannot surface it", async () => {
    const { api, listBrews } = fakeApi()
    await renderHome(api)
    await openCoffeesTab()

    // "24" is the Pour Over's grind on Sumatra Lintong; Brews are not searched.
    await fireEvent.changeText(screen.getByTestId(COFFEE_SEARCH_TEST_ID), '24')

    expect(visibleCoffeeIds()).toEqual([])
    expect(screen.getByText(NO_MATCHING_COFFEES)).toBeTruthy()
    expect(listBrews).not.toHaveBeenCalled()

    await fireEvent.changeText(screen.getByTestId(COFFEE_SEARCH_TEST_ID), '  ')
    expect(visibleCoffeeIds()).toEqual([GUJI, LINTONG, CERRADO])
  })

  it('says so when there are no Coffees', async () => {
    await renderHome(fakeApi({ list: () => Promise.resolve([]) }).api)
    await fireEvent.press(screen.getByTestId(TAB_COFFEES_TEST_ID))

    expect(await screen.findByText(EMPTY_COFFEES)).toBeTruthy()
    expect(screen.queryByTestId(COFFEE_SEARCH_TEST_ID)).toBeNull()
  })

  it('opens a Coffee with its details and Brews, Sealed ones withheld', async () => {
    const { api, listBrews } = fakeApi()
    const view = await renderHome(api)
    await openCoffeesTab()

    await fireEvent.press(
      screen.getByTestId(`${COFFEE_ROW_TEST_ID_PREFIX}${LINTONG}`),
    )

    const detail = await screen.findByTestId(COFFEE_DETAIL_TEST_ID)
    expect(listBrews).toHaveBeenCalledWith(LINTONG)
    expect(within(detail).getByText('Dark')).toBeTruthy()
    expect(
      within(detail).getByText('Indonesia, Lintong, Wet-Hulled'),
    ).toBeTruthy()
    expect(within(detail).getByText('Typica')).toBeTruthy()

    await screen.findByTestId(`${BREW_ROW_TEST_ID_PREFIX}pour-1`)
    const summaries = screen
      .getAllByTestId(BREW_SUMMARY_TEST_ID)
      .map((node) => node.props.children)
    expect(summaries).toEqual([
      'Grind 24 · Dose 15g · Water 250g · Ratio 1:16.67 · Time 2m 45s',
      SEALED_BREW,
      'Dose 100g · Water 1000g · Ratio 1:10 · Time 18h',
      // Cold Brew reads in hours and minutes, as on web.
      'Time 0m',
    ])
    const cold = screen.getByTestId(`${BREW_ROW_TEST_ID_PREFIX}cold-1`)
    expect(
      within(cold).getByText(new RegExp(`Cold Brew.*${DIALED_IN}`)),
    ).toBeTruthy()
    writeHostTreeArtifacts(view)

    await fireEvent.press(screen.getByTestId(COFFEE_DETAIL_BACK_TEST_ID))
    expect(await screen.findByTestId(COFFEE_LIST_TEST_ID)).toBeTruthy()
    expect(screen.queryByTestId(COFFEE_DETAIL_TEST_ID)).toBeNull()
  })

  it('keeps the search when coming back from a Coffee', async () => {
    await renderHome(fakeApi().api)
    await openCoffeesTab()
    await fireEvent.changeText(
      screen.getByTestId(COFFEE_SEARCH_TEST_ID),
      'wet-hulled',
    )

    await fireEvent.press(
      screen.getByTestId(`${COFFEE_ROW_TEST_ID_PREFIX}${LINTONG}`),
    )
    await fireEvent.press(await screen.findByTestId(COFFEE_DETAIL_BACK_TEST_ID))

    await screen.findByTestId(COFFEE_LIST_TEST_ID)
    expect(screen.getByTestId(COFFEE_SEARCH_TEST_ID).props.value).toBe(
      'wet-hulled',
    )
    expect(visibleCoffeeIds()).toEqual([LINTONG])
  })

  it("retries a Coffee's Brews that failed to load", async () => {
    let fail = true
    const { api } = fakeApi({
      listBrews: () =>
        fail
          ? Promise.reject(new Error('offline'))
          : Promise.resolve(LINTONG_BREWS),
    })
    await renderHome(api)
    await openCoffeesTab()
    await fireEvent.press(
      screen.getByTestId(`${COFFEE_ROW_TEST_ID_PREFIX}${LINTONG}`),
    )

    expect(await screen.findByText(ERROR_LOAD_BREWS)).toBeTruthy()
    fail = false
    await fireEvent.press(screen.getByText('Try again'))

    await waitFor(() =>
      expect(
        screen.getByTestId(`${BREW_ROW_TEST_ID_PREFIX}pour-1`),
      ).toBeTruthy(),
    )
  })

  it('switches back to the Espresso list', async () => {
    await renderHome(fakeApi().api)
    await openCoffeesTab()

    await fireEvent.press(screen.getByTestId(TAB_ESPRESSO_TEST_ID))

    expect(await screen.findByTestId('shot-list')).toBeTruthy()
    expect(screen.queryByTestId(COFFEE_LIST_TEST_ID)).toBeNull()
  })

  it('reads the Brews again each time a Coffee opens', async () => {
    // Production cache settings: test clients drop queries on unmount.
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000, retry: false } },
    })
    let brews = LINTONG_BREWS.slice(1)
    const { api } = fakeApi({ listBrews: () => Promise.resolve(brews) })
    const lintong = COFFEES[1]
    const detail = () => (
      <QueryClientProvider client={client}>
        <CoffeeDetail
          api={api}
          userId="user-ada"
          coffee={lintong}
          onBack={() => {}}
        />
      </QueryClientProvider>
    )
    try {
      const first = await render(detail())
      await screen.findByTestId(`${BREW_ROW_TEST_ID_PREFIX}shot-sealed`)
      await first.unmount()

      // A Brew logged on another tab before the Coffee is opened again.
      brews = LINTONG_BREWS
      await render(detail())

      expect(
        await screen.findByTestId(`${BREW_ROW_TEST_ID_PREFIX}pour-1`),
      ).toBeTruthy()
    } finally {
      client.clear()
    }
  })
})
