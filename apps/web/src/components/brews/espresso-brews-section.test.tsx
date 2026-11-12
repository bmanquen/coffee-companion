import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EspressoBrewsSection } from './espresso-brews-section'
import type * as ReactRouter from '@tanstack/react-router'
import {
  ESPRESSO_SHOT_PAGE_SIZE,
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

beforeEach(() => mocks.track.mockClear())

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
  offset = 0,
  extra: {
    coffees?: Array<ReturnType<typeof makeCoffee>>
    filters?: { coffeeId?: string; q?: string }
  } = {},
) {
  seedEspressoShotPage(
    queryClient,
    trpc,
    shots,
    total,
    offset,
    extra.filters,
  )
  if (offset === 0 && !extra.filters) {
    seedCoffees(queryClient, trpc, extra.coffees ?? coffeesFrom(shots))
  }
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
    seedEspressoShotPage(queryClient, trpc, [huila], 1, 0, { q: 'Huila' })

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('Ethiopia Guji')).toBeTruthy()
    expect(table.getByText('Colombia Huila')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('Filter shots...'), {
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

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('dialedInBrew.set')
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

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('dialedInBrew.unset')
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
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('espressoShot.delete')
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
        id: `s${index}`,
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
      ESPRESSO_SHOT_PAGE_SIZE,
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
    seedLog(queryClient, trpc, [loaded], 1, 0, {
      coffees: [
        makeCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        makeCoffee({ id: 'c-unloaded', name: 'Kenya Nyeri' }),
      ],
    })
    seedEspressoShotPage(queryClient, trpc, [], 0, 0, {
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
    seedEspressoShotPage(queryClient, trpc, [huila], 1, 0, {
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

  it('retries a failed load-more from the error', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Network request failed'))
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      const first = Array.from({ length: ESPRESSO_SHOT_PAGE_SIZE }, (_, index) =>
        makeRecentShot({
          id: `s${index}`,
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

      seedEspressoShotPage(
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
        ESPRESSO_SHOT_PAGE_SIZE,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(
        await within(screen.getByRole('table')).findByText('Coffee extra'),
      ).toBeTruthy()
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
