import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EspressoBrewsSection } from './espresso-brews-section'
import type * as ReactRouter from '@tanstack/react-router'
import {
  ESPRESSO_COFFEES_LOAD_FAILED,
  ESPRESSO_LOADING_SHOTS,
  ESPRESSO_LOAD_FAILED,
  ESPRESSO_SHOT_FILTER_DEBOUNCE_MS,
  ESPRESSO_SHOT_PAGE_SIZE,
  ESPRESSO_SHOT_Q_MAX,
  espressoShotPageInput,
} from '@/hooks/use-espresso-shot-pages'
import {
  espressoShotCursor,
  espressoShotFixtureId,
  seedCoffees,
  seedEspressoShotPage,
} from '@/test/espresso-shots'
import {
  makeCoffee,
  makeRecentCoffee,
  makeRecentShot,
} from '@/test/factories'
import { createTestProviders } from '@/test/providers'
import { trpcSuccess } from '@/test/trpc-response'

const mocks = vi.hoisted(() => ({ track: vi.fn() }))

vi.mock('@/lib/analytics', () => ({ track: mocks.track }))

vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandEmpty: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandInput: ({ placeholder }: { placeholder?: string }) => (
    <input placeholder={placeholder} />
  ),
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode
    onSelect?: () => void
  }) => (
    <div role="option" onClick={() => onSelect?.()}>
      {children}
    </div>
  ),
}))

const LOAD_MORE_DURING_FILTER_TIMEOUT_MS = 15_000
const FILTER_SETTLE_TIMEOUT_MS = ESPRESSO_SHOT_FILTER_DEBOUNCE_MS + 5_000

beforeEach(() => mocks.track.mockClear())

afterEach(() => {
  vi.restoreAllMocks()
})

function coffeesFrom(shots: Array<ReturnType<typeof makeRecentShot>>) {
  const byId = new Map<string, ReturnType<typeof makeCoffee>>()
  for (const shot of shots) {
    if (!byId.has(shot.coffeeId)) {
      byId.set(
        shot.coffeeId,
        makeCoffee({
          id: shot.coffeeId,
          name: shot.coffee.name,
          roaster: shot.coffee.roaster ?? null,
        }),
      )
    }
  }
  return [...byId.values()]
}

function seedLog(
  queryClient: ReturnType<typeof createTestProviders>['queryClient'],
  trpc: ReturnType<typeof createTestProviders>['trpc'],
  shots: Array<ReturnType<typeof makeRecentShot>>,
  total = shots.length,
  extra: {
    cursor?: ReturnType<typeof espressoShotCursor>
    coffees?: Array<ReturnType<typeof makeCoffee>>
    filters?: { coffeeId?: string; q?: string }
  } = {},
) {
  seedEspressoShotPage(
    queryClient,
    trpc,
    shots,
    total,
    extra.cursor,
    extra.filters,
  )
  if (!extra.cursor && !extra.filters) {
    seedCoffees(queryClient, trpc, extra.coffees ?? coffeesFrom(shots))
  }
}

function trpcCallText(input: unknown, init?: unknown) {
  const body = String((init as RequestInit | undefined)?.body ?? '')
  return `${String(input)}\n${body}`
}

function isEspressoCursorRequest(input: unknown, init?: unknown) {
  return /"cursor"\s*:/.test(decodeURIComponent(trpcCallText(input, init)))
}

// Link needs router context; swap it for a plain anchor for unit rendering.
// Resolve `params` into `to` (e.g. /espresso/$shotId/edit -> /espresso/s1/edit)
// so tests can assert the real navigation target.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>()
  return {
    ...actual,
    Link: ({
      to,
      params,
      children,
      ...props
    }: {
      to: string
      params?: Record<string, string>
      children: React.ReactNode
    }) => {
      const href = params
        ? Object.entries(params).reduce(
            (acc, [key, value]) => acc.replace(`$${key}`, value),
            to,
          )
        : to
      return (
        <a href={href} {...props}>
          {children}
        </a>
      )
    },
  }
})

describe('EspressoBrewsSection', () => {
  it('shows the empty state when there are no shots', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    seedLog(queryClient, trpc, [])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    expect(screen.getByText(/No espresso shots yet/i)).toBeTruthy()
  })

  it('shows loading instead of the empty state while the first page is pending', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    seedCoffees(queryClient, trpc, [])
    void queryClient.prefetchQuery({
      ...trpc.espressoShot.getRecent.queryOptions(espressoShotPageInput()),
      queryFn: () => new Promise<never>(() => {}),
    })

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText(ESPRESSO_LOADING_SHOTS)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'All coffees' })).toBeTruthy()
    expect(screen.getByPlaceholderText('Filter shots...')).toBeTruthy()
    expect(screen.queryByText(/No espresso shots yet/i)).toBeNull()
  })

  it('retries a failed coffee-library load without hiding shots', async () => {
    const coffees = [
      makeCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
    ]
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce(trpcSuccess(coffees))
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      seedEspressoShotPage(queryClient, trpc, [makeRecentShot({ id: 's1' })])

      render(<EspressoBrewsSection />, { wrapper: Wrapper })
      expect(await screen.findByText(ESPRESSO_COFFEES_LOAD_FAILED)).toBeTruthy()
      expect(
        within(screen.getByRole('table')).getByText('Ethiopia Guji'),
      ).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'All coffees' })).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(
        await screen.findByRole('button', { name: 'All coffees' }),
      ).toBeTruthy()
      expect(screen.queryByText(ESPRESSO_COFFEES_LOAD_FAILED)).toBeNull()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('shows a retry instead of the empty state when the first page fails', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValue(
        trpcSuccess({ items: [], total: 0, nextCursor: null }),
      )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      seedCoffees(queryClient, trpc, [])

      render(<EspressoBrewsSection />, { wrapper: Wrapper })

      expect(await screen.findByText(ESPRESSO_LOAD_FAILED)).toBeTruthy()
      expect(screen.getByRole('button', { name: 'All coffees' })).toBeTruthy()
      expect(screen.getByPlaceholderText('Filter shots...')).toBeTruthy()
      expect(screen.queryByText(/No espresso shots yet/i)).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(
        await screen.findByText(/No espresso shots yet/i),
      ).toBeTruthy()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('renders shots with dose and yield', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    seedLog(queryClient, trpc, [
      makeRecentShot({ id: 's1', dose: '18', yield: '36' }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('Ethiopia Guji')).toBeTruthy()
    expect(table.getByText('18g')).toBeTruthy()
    expect(table.getByText('36g')).toBeTruthy()
    expect(table.getByText('1:2')).toBeTruthy()
    expect(table.getByText('Ratio')).toBeTruthy()
    expect(within(table.getByText('36g').closest('td')!).queryByText('1:2')).toBeNull()
  })

  it('filters shots by the free-text filter', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    const guji = makeRecentShot({
      id: 's1',
      coffeeId: 'c1',
      coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
    })
    const huila = makeRecentShot({
      id: 's2',
      coffeeId: 'c2',
      coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
    })
    seedLog(queryClient, trpc, [guji, huila])
    seedEspressoShotPage(queryClient, trpc, [huila], 1, undefined, { q: 'Huila' })

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('Ethiopia Guji')).toBeTruthy()
    expect(table.getByText('Colombia Huila')).toBeTruthy()

    const filter = screen.getByPlaceholderText('Filter shots...')
    expect(filter.getAttribute('maxLength')).toBe(String(ESPRESSO_SHOT_Q_MAX))
    fireEvent.change(filter, {
      target: { value: 'Huila' },
    })

    await waitFor(() => expect(table.queryByText('Ethiopia Guji')).toBeNull())
    expect(table.getByText('Colombia Huila')).toBeTruthy()
  })

  it('renders the recipe columns', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    seedLog(queryClient, trpc, [
      makeRecentShot({
        id: 's1',
        dose: '18',
        yield: '36',
        time: 28,
        grindSetting: '4.5',
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('18g')).toBeTruthy() // dose
    expect(table.getByText('36g')).toBeTruthy() // yield
    expect(table.getByText('1:2')).toBeTruthy()
    expect(table.getByText('Ratio')).toBeTruthy()
    expect(table.getByText('28s')).toBeTruthy() // time
    expect(table.getByText('4.5')).toBeTruthy() // grind setting
  })

  it('shows the computed ratio as its own card-summary field', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    seedLog(queryClient, trpc, [
      makeRecentShot({ id: 's1', dose: '18', yield: '36' }),
    ])

    const { container } = render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const cards = container.querySelector<HTMLElement>('.lg\\:hidden')!
    const yieldStat = within(cards).getByText('Yield').closest('div')!
    expect(within(yieldStat).getByText('36g')).toBeTruthy()
    expect(within(yieldStat).queryByText('1:2')).toBeNull()
    const ratioStat = within(cards).getByText('Ratio').closest('div')!
    expect(within(ratioStat).getByText('1:2')).toBeTruthy()
  })

  it('shows no ratio when dose is missing', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    seedLog(queryClient, trpc, [
      makeRecentShot({ id: 's1', dose: null, yield: '36' }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('36g')).toBeTruthy()
    expect(table.queryByText(/^1:/)).toBeNull()
  })

  it('does not leave an empty ratio slot on the card when there is no ratio', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    seedLog(queryClient, trpc, [
      makeRecentShot({ id: 's1', dose: null, yield: '36' }),
    ])

    const { container } = render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const cards = container.querySelector<HTMLElement>('.lg\\:hidden')!
    expect(within(cards).queryByText('Ratio')).toBeNull()
    const yieldStat = within(cards).getByText('Yield').closest('div')!
    expect(within(yieldStat).getByText('36g')).toBeTruthy()
  })

  it('shows no ratio when yield is missing', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    seedLog(queryClient, trpc, [
      makeRecentShot({ id: 's1', dose: '18', yield: null }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('18g')).toBeTruthy()
    expect(table.queryByText(/^1:/)).toBeNull()
  })

  it('falls back to a dash for missing recipe values', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    seedLog(queryClient, trpc, [
      makeRecentShot({
        id: 's1',
        dose: null,
        yield: null,
        time: null,
        grindSetting: null,
        notes: null,
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    // Empty grind/dose/yield/time summary columns render as "-"; empty notes
    // show the "No notes..." placeholder in the expander (BrewDetails).
    expect(table.getAllByText('-').length).toBeGreaterThanOrEqual(4)
    expect(table.getByText('No notes...')).toBeTruthy()
  })

  it('highlights the dialed-in row and not the others', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    seedLog(queryClient, trpc, [
      makeRecentShot({
        id: 's1',
        isDialedIn: true,
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makeRecentShot({
        id: 's2',
        isDialedIn: false,
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    const dialedRow = table.getByText('Ethiopia Guji').closest('tr')!
    const otherRow = table.getByText('Colombia Huila').closest('tr')!
    expect(dialedRow.className).toContain('bg-primary')
    expect(otherRow.className).not.toContain('bg-primary')
  })

  it('links each row to its edit page and the header to the new-shot form', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    seedLog(queryClient, trpc, [
      makeRecentShot({ id: 's1' }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    // The edit control is an icon button wrapped in a Link; walk to the anchor.
    const editAnchor = table
      .getByRole('button', { name: 'Edit shot' })
      .closest('a')
    expect(editAnchor?.getAttribute('href')).toBe('/espresso/s1/edit')
    // Header action links to the log form.
    const logAnchor = screen
      .getByRole('button', { name: 'Log Shot' })
      .closest('a')
    expect(logAnchor?.getAttribute('href')).toBe('/espresso/new')
  })

  it('reflects each shot’s dialed-in state on the crosshair toggle', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    seedLog(queryClient, trpc, [
      makeRecentShot({
        id: 's1',
        isDialedIn: true,
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makeRecentShot({
        id: 's2',
        isDialedIn: false,
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    const dialed = table.getByRole('button', {
      name: 'Dialed in Ethiopia Guji — clear',
    })
    expect(dialed.getAttribute('aria-pressed')).toBe('true')
    const notDialed = table.getByRole('button', {
      name: 'Mark Colombia Huila as dialed in',
    })
    expect(notDialed.getAttribute('aria-pressed')).toBe('false')
  })

  it('opens a delete confirmation dialog naming the coffee', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    seedLog(queryClient, trpc, [
      makeRecentShot({
        id: 's1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    fireEvent.click(table.getByRole('button', { name: 'Delete shot' }))

    const dialog = within(screen.getByRole('dialog'))
    expect(
      dialog.getByText(/Are you sure you want to delete this shot/i),
    ).toBeTruthy()
    expect(dialog.getByText(/Ethiopia Guji/)).toBeTruthy()
    expect(dialog.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('fires dialedInBrew.set when toggled on', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(trpcSuccess())
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      seedLog(queryClient, trpc, [
        makeRecentShot({
          id: 's1',
          isDialedIn: false,
          coffeeId: 'c1',
          coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        }),
      ])

      render(<EspressoBrewsSection />, { wrapper: Wrapper })
      const table = within(screen.getByRole('table'))
      fireEvent.click(
        table.getByRole('button', { name: 'Mark Ethiopia Guji as dialed in' }),
      )

      await waitFor(() =>
        expect(
          fetchSpy.mock.calls.some((call) =>
            String(call[0]).includes('dialedInBrew.set'),
          ),
        ).toBe(true),
      )
      const setCall = fetchSpy.mock.calls.find((call) =>
        String(call[0]).includes('dialedInBrew.set'),
      )!
      const [, init] = setCall
      const body = String(init?.body ?? '')
      expect(body).toContain('s1')
      expect(body).toContain('espresso')
      await waitFor(() =>
        expect(mocks.track).toHaveBeenCalledWith('brew_dialed_in', {
          method: 'espresso',
        }),
      )
    } finally {
      fetchSpy.mockRestore()
    }
  })
  it('fires dialedInBrew.unset when toggled off', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(trpcSuccess())
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      seedLog(queryClient, trpc, [
        makeRecentShot({
          id: 's1',
          isDialedIn: true,
          coffeeId: 'c1',
          coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        }),
      ])

      render(<EspressoBrewsSection />, { wrapper: Wrapper })
      const table = within(screen.getByRole('table'))
      fireEvent.click(
        table.getByRole('button', { name: 'Dialed in Ethiopia Guji — clear' }),
      )

      await waitFor(() =>
        expect(
          fetchSpy.mock.calls.some((call) =>
            String(call[0]).includes('dialedInBrew.unset'),
          ),
        ).toBe(true),
      )
      const unsetCall = fetchSpy.mock.calls.find((call) =>
        String(call[0]).includes('dialedInBrew.unset'),
      )!
      const [, init] = unsetCall
      const body = String(init?.body ?? '')
      expect(body).toContain('s1')
      await waitFor(() => expect(queryClient.isMutating()).toBe(0))
      expect(mocks.track).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('deletes the shot when the confirmation dialog is confirmed', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(trpcSuccess())
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      const shot = makeRecentShot({ id: 's1' })
      seedLog(queryClient, trpc, [shot])
      queryClient.setQueryData(trpc.dialedInBrew.list.queryKey(), [])

      render(<EspressoBrewsSection />, { wrapper: Wrapper })
      const table = within(screen.getByRole('table'))
      fireEvent.click(table.getByRole('button', { name: 'Delete shot' }))
      const dialog = within(screen.getByRole('dialog'))
      fireEvent.click(dialog.getByRole('button', { name: 'Delete' }))

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const deleteCall = fetchSpy.mock.calls.find((call) =>
        String(call[0]).includes('espressoShot.delete'),
      )
      expect(deleteCall).toBeTruthy()
      const [, init] = deleteCall!
      expect(String(init?.body ?? '')).toContain('s1')
      await waitFor(() => {
        expect(
          queryClient.getQueryState(trpc.dialedInBrew.list.queryKey())
            ?.isInvalidated,
        ).toBe(true)
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })

  // The detail region for a row: its sibling sub-row's animating grid-rows wrap
  // (grid-rows-[1fr] open, grid-rows-[0fr] collapsed). Always in the DOM.
  const detailRegionFor = (name: string): HTMLElement => {
    const dataRow = within(screen.getByRole('table'))
      .getByText(name)
      .closest('tr')!
    return dataRow.nextElementSibling!.querySelector(
      '[class*="grid-rows-"]',
    ) as HTMLElement
  }

  it('expands a desktop row on click to reveal the brew detail', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    seedLog(queryClient, trpc, [
      makeRecentShot({
        id: 's1',
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        notes: 'tasted bright',
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const row = within(screen.getByRole('table'))
      .getByText('Ethiopia Guji')
      .closest('tr')!
    const region = detailRegionFor('Ethiopia Guji')
    expect(region.className).toContain('grid-rows-[0fr]')

    fireEvent.click(row)

    expect(region.className).toContain('grid-rows-[1fr]')
    const detail = within(region)
    expect(detail.getByText('Grinder')).toBeTruthy()
    expect(detail.getByText('Device')).toBeTruthy()
    expect(detail.getByText('Days off roast')).toBeTruthy()
    expect(detail.getByText('tasted bright')).toBeTruthy()

    fireEvent.click(row)
    expect(region.className).toContain('grid-rows-[0fr]')
  })

  it('keeps only one desktop row expanded at a time (accordion)', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    seedLog(queryClient, trpc, [
      makeRecentShot({
        id: 's1',
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makeRecentShot({
        id: 's2',
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    const row1 = table.getByText('Ethiopia Guji').closest('tr')!
    const row2 = table.getByText('Colombia Huila').closest('tr')!
    const region1 = detailRegionFor('Ethiopia Guji')
    const region2 = detailRegionFor('Colombia Huila')

    fireEvent.click(row1)
    expect(region1.className).toContain('grid-rows-[1fr]')

    fireEvent.click(row2)
    expect(region2.className).toContain('grid-rows-[1fr]')
    expect(region1.className).toContain('grid-rows-[0fr]')
  })

  it('does not expand the row when a control is activated', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      seedLog(queryClient, trpc, [
        makeRecentShot({
          id: 's1',
          isDialedIn: false,
          coffeeId: 'c1',
          coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        }),
      ])

      render(<EspressoBrewsSection />, { wrapper: Wrapper })

      const table = within(screen.getByRole('table'))
      const region = detailRegionFor('Ethiopia Guji')

      // Dialed-in toggle, Edit link, and Delete trigger all sit in cardHideLabel
      // control cells, whose clicks are stopped from bubbling to the row toggle.
      fireEvent.click(
        table.getByRole('button', { name: 'Mark Ethiopia Guji as dialed in' }),
      )
      expect(region.className).toContain('grid-rows-[0fr]')

      fireEvent.click(table.getByRole('button', { name: 'Edit shot' }))
      expect(region.className).toContain('grid-rows-[0fr]')

      fireEvent.click(table.getByRole('button', { name: 'Delete shot' }))
      expect(region.className).toContain('grid-rows-[0fr]')
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('loads the next page when Load more is pressed', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    const first = Array.from({ length: ESPRESSO_SHOT_PAGE_SIZE }, (_, index) =>
      makeRecentShot({
        id: espressoShotFixtureId(index),
        coffeeId: `c${index}`,
        coffee: makeRecentCoffee({ id: `c${index}`, name: `Coffee ${index}` }),
      }),
    )
    seedLog(queryClient, trpc, first, first.length + 1)
    seedLog(
      queryClient,
      trpc,
      [
        makeRecentShot({
          id: 's-next',
          coffeeId: 'c-next',
          coffee: makeRecentCoffee({ id: 'c-next', name: 'Coffee extra' }),
        }),
      ],
      first.length + 1,
      { cursor: espressoShotCursor(first[first.length - 1]) },
    )

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('Coffee 0')).toBeTruthy()
    expect(table.queryByText('Coffee extra')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await table.findByText('Coffee extra')).toBeTruthy()
  })

  it('lists coffees from the library, not only loaded shots', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    const loaded = makeRecentShot({
      id: 's1',
      coffeeId: 'c1',
      coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
    })
    seedLog(queryClient, trpc, [loaded], 1, {
      coffees: [
        makeCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        makeCoffee({ id: 'c-unloaded', name: 'Kenya Nyeri' }),
      ],
    })
    seedEspressoShotPage(queryClient, trpc, [], 0, undefined, {
      coffeeId: 'c-unloaded',
    })

    render(<EspressoBrewsSection />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole('button', { name: 'All coffees' }))
    fireEvent.click(screen.getByRole('option', { name: 'Kenya Nyeri' }))

    await waitFor(() =>
      expect(screen.queryByText('Ethiopia Guji')).toBeNull(),
    )
    expect(screen.getByPlaceholderText('Filter shots...')).toBeTruthy()
  })

  it('filters shots by coffee on the server', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    const guji = makeRecentShot({
      id: 's1',
      coffeeId: 'c1',
      coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
    })
    const huila = makeRecentShot({
      id: 's2',
      coffeeId: 'c2',
      coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
    })
    seedLog(queryClient, trpc, [guji, huila])
    seedEspressoShotPage(queryClient, trpc, [huila], 1, undefined, {
      coffeeId: 'c2',
    })

    render(<EspressoBrewsSection />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole('button', { name: 'All coffees' }))
    fireEvent.click(screen.getByRole('option', { name: 'Colombia Huila' }))

    await waitFor(() =>
      expect(
        within(screen.getByRole('table')).queryByText('Ethiopia Guji'),
      ).toBeNull(),
    )
    expect(
      within(screen.getByRole('table')).getByText('Colombia Huila'),
    ).toBeTruthy()
  })

  it('names same-name coffees with their roaster', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    seedLog(queryClient, trpc, [
      makeRecentShot({
        id: 's1',
        coffeeId: 'c1',
        coffee: {
          ...makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
          roaster: {
            id: 'r1',
            userId: 'u1',
            name: 'Sey',
            nameKey: 'sey',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      }),
      makeRecentShot({
        id: 's2',
        coffeeId: 'c2',
        coffee: {
          ...makeRecentCoffee({ id: 'c2', name: 'Ethiopia Guji' }),
          roaster: {
            id: 'r2',
            userId: 'u1',
            name: 'Onyx',
            nameKey: 'onyx',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Ethiopia Guji · Sey')).toBeTruthy()
    expect(table.getByText('Ethiopia Guji · Onyx')).toBeTruthy()
  })

  it('re-enables Load more when the filter changes during a load-more', async () => {
    let settleLoadMore = () => {}
    const pendingLoadMore = new Promise<Response>((resolve) => {
      settleLoadMore = () =>
        resolve(trpcSuccess({ items: [], total: 0, nextCursor: null }))
    })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, init) => {
        if (isEspressoCursorRequest(input, init)) return pendingLoadMore
        return Promise.resolve(trpcSuccess())
      })
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      const first = Array.from({ length: ESPRESSO_SHOT_PAGE_SIZE }, (_, index) =>
        makeRecentShot({
          id: espressoShotFixtureId(index),
          coffeeId: `c${index}`,
          coffee: makeRecentCoffee({
            id: `c${index}`,
            name: `Coffee ${index}`,
          }),
        }),
      )
      const huilaPage = Array.from(
        { length: ESPRESSO_SHOT_PAGE_SIZE },
        (_, index) =>
          makeRecentShot({
            id: espressoShotFixtureId(100 + index),
            coffeeId: 'c-huila',
            coffee: makeRecentCoffee({
              id: 'c-huila',
              name: index === 0 ? 'Colombia Huila' : `Huila ${index}`,
            }),
          }),
      )
      seedLog(queryClient, trpc, first, first.length + 1, {
        coffees: [
          ...coffeesFrom(first),
          makeCoffee({ id: 'c-huila', name: 'Colombia Huila' }),
        ],
      })
      seedEspressoShotPage(
        queryClient,
        trpc,
        huilaPage,
        huilaPage.length + 1,
        undefined,
        { q: 'Huila' },
      )

      render(<EspressoBrewsSection />, { wrapper: Wrapper })
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
      expect(
        screen.getByRole('button', { name: 'Load more' }),
      ).toHaveProperty('disabled', true)

      fireEvent.change(screen.getByPlaceholderText('Filter shots...'), {
        target: { value: 'Huila' },
      })
      expect(screen.getByPlaceholderText('Filter shots...')).toHaveProperty(
        'value',
        'Huila',
      )
      expect(
        screen.getByRole('button', { name: 'Load more' }),
      ).toHaveProperty('disabled', true)

      await waitFor(
        () => {
          expect(
            within(screen.getByRole('table')).getByText('Colombia Huila'),
          ).toBeTruthy()
          expect(
            screen.getByRole('button', { name: 'Load more' }),
          ).toHaveProperty('disabled', false)
        },
        { timeout: FILTER_SETTLE_TIMEOUT_MS },
      )
    } finally {
      settleLoadMore()
      fetchSpy.mockRestore()
    }
  }, LOAD_MORE_DURING_FILTER_TIMEOUT_MS)

  it('retries a failed load-more from the error', async () => {
    const extra = makeRecentShot({
      id: espressoShotFixtureId(20),
      coffeeId: 'c-next',
      coffee: makeRecentCoffee({ id: 'c-next', name: 'Coffee extra' }),
    })
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce(
        trpcSuccess({
          items: [extra],
          total: ESPRESSO_SHOT_PAGE_SIZE + 1,
          nextCursor: null,
        }),
      )
    const { queryClient, trpc, Wrapper } = createTestProviders({
      fetch: fetchMock,
    })
    const first = Array.from({ length: ESPRESSO_SHOT_PAGE_SIZE }, (_, index) =>
      makeRecentShot({
        id: espressoShotFixtureId(index),
        coffeeId: `c${index}`,
        coffee: makeRecentCoffee({ id: `c${index}`, name: `Coffee ${index}` }),
      }),
    )
    seedLog(queryClient, trpc, first, first.length + 1)
    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(
      await screen.findByText("We couldn't load more shots. Try again."),
    ).toBeTruthy()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await within(screen.getByRole('table')).findByText('Coffee extra'),
    ).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps remaining shots visible when a refetch after delete fails', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (String(input).includes('espressoShot.delete')) {
        return Promise.resolve(trpcSuccess())
      }
      return Promise.reject(new Error('Network request failed'))
    })
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      const first = makeRecentShot({
        id: espressoShotFixtureId(1),
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      })
      const second = makeRecentShot({
        id: espressoShotFixtureId(2),
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Kenya AA' }),
      })
      seedLog(queryClient, trpc, [first, second])
      queryClient.setQueryData(trpc.dialedInBrew.list.queryKey(), [])

      render(<EspressoBrewsSection />, { wrapper: Wrapper })
      const table = within(screen.getByRole('table'))
      expect(table.getByText('Ethiopia Guji')).toBeTruthy()
      expect(table.getByText('Kenya AA')).toBeTruthy()

      const ethiopiaRow = table.getByText('Ethiopia Guji').closest('tr')
      expect(ethiopiaRow).toBeTruthy()
      fireEvent.click(
        within(ethiopiaRow as HTMLElement).getByRole('button', {
          name: 'Delete shot',
        }),
      )
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: 'Delete',
        }),
      )

      expect(await screen.findByText(ESPRESSO_LOAD_FAILED)).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
      expect(table.queryByText('Ethiopia Guji')).toBeNull()
      expect(table.getByText('Kenya AA')).toBeTruthy()
      expect(table.getByRole('button', { name: 'Edit shot' })).toBeTruthy()
      expect(table.getByRole('button', { name: 'Delete shot' })).toBeTruthy()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('deletes the original shot when a refetch inserts a row ahead of an open dialog', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(trpcSuccess())
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      const first = makeRecentShot({
        id: espressoShotFixtureId(1),
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      })
      const second = makeRecentShot({
        id: espressoShotFixtureId(2),
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Kenya AA' }),
      })
      seedLog(queryClient, trpc, [first, second])
      queryClient.setQueryData(trpc.dialedInBrew.list.queryKey(), [])

      render(<EspressoBrewsSection />, { wrapper: Wrapper })
      const table = within(screen.getByRole('table'))
      const kenyaRow = table.getByText('Kenya AA').closest('tr')
      expect(kenyaRow).toBeTruthy()
      fireEvent.click(
        within(kenyaRow as HTMLElement).getByRole('button', {
          name: 'Delete shot',
        }),
      )
      expect(screen.getByRole('dialog')).toBeTruthy()

      const inserted = makeRecentShot({
        id: espressoShotFixtureId(0),
        coffeeId: 'c0',
        coffee: makeRecentCoffee({ id: 'c0', name: 'Costa Rica' }),
      })
      seedEspressoShotPage(queryClient, trpc, [inserted, first, second])

      expect(await table.findByText('Costa Rica')).toBeTruthy()
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: 'Delete',
        }),
      )

      await waitFor(() => {
        const deleteCall = fetchSpy.mock.calls.find((call) =>
          trpcCallText(call[0], call[1]).includes('espressoShot.delete'),
        )
        expect(deleteCall).toBeTruthy()
        expect(trpcCallText(deleteCall![0], deleteCall![1])).toContain(
          second.id,
        )
        expect(trpcCallText(deleteCall![0], deleteCall![1])).not.toContain(
          inserted.id,
        )
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('hides the previous filter’s shots while the next page is pending', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    const guji = makeRecentShot({
      id: 's1',
      coffeeId: 'c1',
      coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
    })
    seedLog(queryClient, trpc, [guji])
    void queryClient.prefetchQuery({
      ...trpc.espressoShot.getRecent.queryOptions(
        espressoShotPageInput(undefined, { q: 'zzz' }),
      ),
      queryFn: () => new Promise<never>(() => {}),
    })

    render(<EspressoBrewsSection />, { wrapper: Wrapper })
    expect(screen.getAllByText('Ethiopia Guji').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByPlaceholderText('Filter shots...'), {
      target: { value: 'zzz' },
    })
    expect(screen.getByPlaceholderText('Filter shots...')).toHaveProperty(
      'value',
      'zzz',
    )
    expect(screen.getByRole('table')).toBeTruthy()

    expect(await screen.findByRole('status')).toBeTruthy()
    expect(screen.getByText(ESPRESSO_LOADING_SHOTS)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit shot' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete shot' })).toBeNull()
  })

  it('hides Load more after an empty last page', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    const first = Array.from({ length: ESPRESSO_SHOT_PAGE_SIZE }, (_, index) =>
      makeRecentShot({
        id: espressoShotFixtureId(index),
        coffeeId: `c${index}`,
        coffee: makeRecentCoffee({ id: `c${index}`, name: `Coffee ${index}` }),
      }),
    )
    const cursor = espressoShotCursor(first[first.length - 1])
    seedEspressoShotPage(
      queryClient,
      trpc,
      first,
      first.length,
      undefined,
      {},
      cursor,
    )
    seedCoffees(queryClient, trpc, coffeesFrom(first))
    seedEspressoShotPage(queryClient, trpc, [], first.length, cursor, {}, null)

    render(<EspressoBrewsSection />, { wrapper: Wrapper })
    expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull(),
    )
    expect(within(screen.getByRole('table')).getByText('Coffee 0')).toBeTruthy()
  })
})
