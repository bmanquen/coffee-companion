import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Dashboard } from './dashboard'
import type * as ReactRouter from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { DashboardMethod } from '@/components/dashboard/methods'
import { dashboardMethods } from '@/components/dashboard/methods'
import {
  ESPRESSO_LOADING_SHOTS,
  ESPRESSO_LOAD_FAILED,
  ESPRESSO_SHOT_PAGE_SIZE,
  espressoShotPageInput,
} from '@/hooks/use-espresso-shot-pages'
import {
  espressoShotCursor,
  seedCoffees,
  seedEspressoShotPage,
} from '@/test/espresso-shots'
import { trpcSuccess } from '@/test/trpc-response'
import {
  makeAeropressBrew,
  makeCoffee,
  makeColdBrewBrew,
  makeFrenchpressBrew,
  makePouroverBrew,
  makeRecentCoffee,
  makeRecentShot,
} from '@/test/factories'
import { createTestProviders } from '@/test/providers'

// Link needs router context; swap it for a plain anchor for unit rendering.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>()
  return {
    ...actual,
    Link: ({
      to,
      children,
      ...props
    }: {
      to: string
      children: React.ReactNode
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

// Mock cmdk so the CoffeeFilter's options are clickable in jsdom (cmdk relies on
// browser-only internals). Mirrors coffee-filter.test.tsx.
vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandInput: ({ placeholder }: { placeholder?: string }) => (
    <input placeholder={placeholder} />
  ),
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode
    onSelect?: () => void
  }) => (
    <div role="option" onClick={() => onSelect?.()}>
      {children}
    </div>
  ),
}))

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

// Seed every method's history so any tab can render; each defaults to empty and
// is overridden per test. Espresso is a paged getRecent result.
function seed(
  shots: Array<ReturnType<typeof makeRecentShot>>,
  others: {
    pourover?: Array<ReturnType<typeof makePouroverBrew>>
    frenchpress?: Array<ReturnType<typeof makeFrenchpressBrew>>
    aeropress?: Array<ReturnType<typeof makeAeropressBrew>>
    coldbrew?: Array<ReturnType<typeof makeColdBrewBrew>>
  } = {},
) {
  const providers = createTestProviders()
  const { queryClient, trpc } = providers
  seedEspressoShotPage(queryClient, trpc, shots)
  seedCoffees(queryClient, trpc, coffeesFrom(shots))
  queryClient.setQueryData(
    trpc.pouroverBrew.getAll.queryKey(),
    others.pourover ?? [],
  )
  queryClient.setQueryData(
    trpc.frenchpressBrew.getAll.queryKey(),
    others.frenchpress ?? [],
  )
  queryClient.setQueryData(
    trpc.aeropressBrew.getAll.queryKey(),
    others.aeropress ?? [],
  )
  queryClient.setQueryData(
    trpc.coldBrewBrew.getAll.queryKey(),
    others.coldbrew ?? [],
  )
  return providers
}

// A fixed "now" for relative-time assertions; the default factory createdAt is
// 2026-06-01T08:00, so this reads as "2d ago".
const NOW = new Date('2026-06-03T08:00:00Z')

// Render the prop-driven Dashboard at a given selected method. The selection is
// owned by the route in production; here we pass it directly and hand back a spy
// so tests can assert what a picker choice requests. Which method is selected by
// default (URL param vs. most-recent) is covered by resolveSelectedMethod's unit
// tests and the e2e spec, not here. `feeds` mirrors the seeded data so the picker
// rows and the rendered feed agree.
function renderDashboard(
  selectedMethod: DashboardMethod,
  shots: Array<ReturnType<typeof makeRecentShot>> = [],
  others: Parameters<typeof seed>[1] = {},
  extraSeed?: (providers: ReturnType<typeof seed>) => void,
) {
  const providers = seed(shots, others)
  extraSeed?.(providers)
  const onSelectMethod = vi.fn()
  const feeds = [
    { method: 'espresso' as const, brews: shots },
    { method: 'pourover' as const, brews: others.pourover ?? [] },
    { method: 'frenchpress' as const, brews: others.frenchpress ?? [] },
    { method: 'aeropress' as const, brews: others.aeropress ?? [] },
    { method: 'coldbrew' as const, brews: others.coldbrew ?? [] },
  ]
  const utils = render(
    <Dashboard
      selectedMethod={selectedMethod}
      onSelectMethod={onSelectMethod}
      feeds={feeds}
      now={NOW}
    />,
    { wrapper: providers.Wrapper },
  )
  // Open the picker dropdown so its option rows are queryable. The trigger
  // button's accessible name is the current method's label.
  const currentLabel = dashboardMethods.find(
    (m) => m.value === selectedMethod,
  )!.label
  const openPicker = () =>
    fireEvent.click(screen.getByRole('button', { name: currentLabel }))
  return { ...providers, ...utils, onSelectMethod, openPicker }
}

describe('Dashboard', () => {
  it('shows the selected method on the picker trigger, and none of the old cards', () => {
    renderDashboard('espresso', [makeRecentShot()])

    // The collapsed picker reflects the current method.
    expect(screen.getByRole('button', { name: 'Espresso' })).toBeTruthy()

    // The eight previous stacked cards are gone.
    expect(screen.queryByText('Recent Espresso Shots')).toBeNull()
    expect(screen.queryByText('Recent Coffees')).toBeNull()
    expect(screen.queryByText(/Dialed-in Shots/i)).toBeNull()
  })

  it('shows each shot with its core stats on the face', () => {
    renderDashboard('espresso', [makeRecentShot()])

    // Scope to the desktop table; the mobile card layout renders in parallel.
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Ethiopia Guji')).toBeTruthy()
    // Core weights are on the face — no expansion needed.
    expect(table.getByText('18g')).toBeTruthy()
    expect(table.getByText('36g')).toBeTruthy()
    expect(table.getByText('1:2')).toBeTruthy()
    expect(table.getByText('Ratio')).toBeTruthy()
    expect(within(table.getByText('36g').closest('td')!).queryByText('1:2')).toBeNull()
    expect(table.getByText('28s')).toBeTruthy()
  })

  it('highlights a dialed-in shot with the icon and a row highlight', () => {
    renderDashboard('espresso', [makeRecentShot({ isDialedIn: true })])
    const table = within(screen.getByRole('table'))
    expect(table.getByLabelText('Dialed in')).toBeTruthy()
    // The dialed-in reference row is visually highlighted, not just badged.
    const row = table.getByText('Ethiopia Guji').closest('tr')!
    expect(row.className).toContain('bg-primary/10')
  })

  it('does not highlight a regular shot', () => {
    renderDashboard('espresso', [makeRecentShot({ isDialedIn: false })])
    const table = within(screen.getByRole('table'))
    expect(table.queryByLabelText('Dialed in')).toBeNull()
    const row = table.getByText('Ethiopia Guji').closest('tr')!
    expect(row.className).not.toContain('bg-primary/10')
  })

  it('reveals grinder and days off roast when a shot is expanded', async () => {
    renderDashboard('espresso', [makeRecentShot({ roastDate: '2026-05-25' })])
    const table = within(screen.getByRole('table'))

    await act(async () => {
      fireEvent.click(table.getByText('Ethiopia Guji').closest('tr')!)
    })
    expect(table.getByText(/Niche Zero/)).toBeTruthy()
    expect(table.getByText('7d')).toBeTruthy()
  })

  it('offers a Log Shot button to start a new espresso shot', () => {
    renderDashboard('espresso', [makeRecentShot()])
    const link = screen.getByRole('link', { name: /Log Shot/i })
    expect(link.getAttribute('href')).toBe('/espresso/new')
  })

  it('shows an empty state when there are no shots', () => {
    renderDashboard('espresso', [])
    expect(screen.getByText(/No espresso shots yet/i)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /Log your first shot/i }),
    ).toBeTruthy()
  })

  it('shows loading instead of the empty state while the first page is pending', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    seedCoffees(queryClient, trpc, [])
    queryClient.setQueryData(trpc.pouroverBrew.getAll.queryKey(), [])
    queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [])
    queryClient.setQueryData(trpc.aeropressBrew.getAll.queryKey(), [])
    queryClient.setQueryData(trpc.coldBrewBrew.getAll.queryKey(), [])
    void queryClient.prefetchQuery({
      ...trpc.espressoShot.getRecent.queryOptions(espressoShotPageInput()),
      queryFn: () => new Promise<never>(() => {}),
    })
    render(
      <Dashboard
        selectedMethod="espresso"
        onSelectMethod={vi.fn()}
        feeds={[
          { method: 'espresso', brews: [] },
          { method: 'pourover', brews: [] },
          { method: 'frenchpress', brews: [] },
          { method: 'aeropress', brews: [] },
          { method: 'coldbrew', brews: [] },
        ]}
        now={NOW}
      />,
      { wrapper: Wrapper },
    )
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText(ESPRESSO_LOADING_SHOTS)).toBeTruthy()
    expect(screen.queryByText(/No espresso shots yet/i)).toBeNull()
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
      queryClient.setQueryData(trpc.pouroverBrew.getAll.queryKey(), [])
      queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [])
      queryClient.setQueryData(trpc.aeropressBrew.getAll.queryKey(), [])
      queryClient.setQueryData(trpc.coldBrewBrew.getAll.queryKey(), [])
      render(
        <Dashboard
          selectedMethod="espresso"
          onSelectMethod={vi.fn()}
          feeds={[
            { method: 'espresso', brews: [] },
            { method: 'pourover', brews: [] },
            { method: 'frenchpress', brews: [] },
            { method: 'aeropress', brews: [] },
            { method: 'coldbrew', brews: [] },
          ]}
          now={NOW}
        />,
        { wrapper: Wrapper },
      )
      expect(await screen.findByText(ESPRESSO_LOAD_FAILED)).toBeTruthy()
      expect(screen.queryByText(/No espresso shots yet/i)).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(
        await screen.findByText(/No espresso shots yet/i),
      ).toBeTruthy()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('narrows the feed to dialed-in shots when the toggle is on', async () => {
    const dialed = makeRecentShot({
      id: 's1',
      isDialedIn: true,
      coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
    })
    const other = makeRecentShot({
      id: 's2',
      isDialedIn: false,
      coffeeId: 'c2',
      coffee: makeRecentCoffee({ id: 'c2', name: 'Kenya AA' }),
    })
    renderDashboard('espresso', [dialed, other], {}, ({ queryClient, trpc }) => {
      seedEspressoShotPage(queryClient, trpc, [dialed], 1, undefined, {
        dialedIn: true,
      })
    })

    let table = within(screen.getByRole('table'))
    expect(table.getByText('Kenya AA')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dialed-in only' }))
    })

    table = within(screen.getByRole('table'))
    expect(table.queryByText('Kenya AA')).toBeNull()
    expect(table.getByText('Ethiopia Guji')).toBeTruthy()
  })

  it('narrows the feed to a single coffee when one is picked', async () => {
    const guji = makeRecentShot({
      id: 's1',
      coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
    })
    const kenya = makeRecentShot({
      id: 's2',
      coffeeId: 'c2',
      coffee: makeRecentCoffee({ id: 'c2', name: 'Kenya AA' }),
    })
    renderDashboard('espresso', [guji, kenya], {}, ({ queryClient, trpc }) => {
      seedEspressoShotPage(queryClient, trpc, [kenya], 1, undefined, {
        coffeeId: 'c2',
      })
    })

    // Open the coffee filter and pick Kenya AA.
    await act(async () => {
      fireEvent.click(screen.getByText('All coffees'))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'Kenya AA' }))
    })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('Kenya AA')).toBeTruthy()
    expect(table.queryByText('Ethiopia Guji')).toBeNull()
  })

  it('lists coffees from the library, not only loaded shots', async () => {
    renderDashboard(
      'espresso',
      [
        makeRecentShot({
          coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        }),
      ],
      {},
      ({ queryClient, trpc }) => {
        seedCoffees(queryClient, trpc, [
          makeCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
          makeCoffee({ id: 'c-extra', name: 'Kenya Nyeri' }),
        ])
        seedEspressoShotPage(queryClient, trpc, [], 0, undefined, {
          coffeeId: 'c-extra',
        })
      },
    )

    await act(async () => {
      fireEvent.click(screen.getByText('All coffees'))
    })
    expect(screen.getByRole('option', { name: 'Kenya Nyeri' })).toBeTruthy()
  })

  it('keeps the table page when more shots append, and resets it when the filter changes', async () => {
    const shots = Array.from({ length: 6 }, (_, i) =>
      makeRecentShot({
        id: `s${i}`,
        coffeeId: `c${i}`,
        coffee: makeRecentCoffee({ id: `c${i}`, name: `Coffee ${i + 1}` }),
      }),
    )
    const extra = Array.from({ length: 5 }, (_, i) =>
      makeRecentShot({
        id: `n${i}`,
        coffeeId: `n${i}`,
        coffee: makeRecentCoffee({ id: `n${i}`, name: `Extra ${i + 1}` }),
      }),
    )
    renderDashboard('espresso', shots, {}, ({ queryClient, trpc }) => {
      seedEspressoShotPage(
        queryClient,
        trpc,
        shots,
        shots.length + extra.length,
        undefined,
        {},
        espressoShotCursor(shots[shots.length - 1]),
      )
      seedEspressoShotPage(
        queryClient,
        trpc,
        extra,
        shots.length + extra.length,
        espressoShotCursor(shots[shots.length - 1]),
      )
      seedEspressoShotPage(queryClient, trpc, [shots[0]], 1, undefined, {
        coffeeId: shots[0].coffeeId,
      })
      seedCoffees(queryClient, trpc, coffeesFrom([...shots, ...extra]))
    })

    expect(screen.getByText('Page 1 of 2')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next page'))
    })
    expect(screen.getByText('Page 2 of 2')).toBeTruthy()
    expect(within(screen.getByRole('table')).getByText('Coffee 6')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(
      await screen.findByText('Page 2 of 3'),
    ).toBeTruthy()
    expect(within(screen.getByRole('table')).getByText('Coffee 6')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByText('All coffees'))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'Coffee 1' }))
    })
    expect(screen.getByText('Page 1 of 1')).toBeTruthy()
    expect(within(screen.getByRole('table')).getByText('Coffee 1')).toBeTruthy()
    expect(within(screen.getByRole('table')).queryByText('Coffee 6')).toBeNull()
  })

  it('pages through the feed client-side', async () => {
    const shots = Array.from({ length: 6 }, (_, i) =>
      makeRecentShot({
        id: `s${i}`,
        coffeeId: `c${i}`,
        coffee: makeRecentCoffee({ id: `c${i}`, name: `Coffee ${i + 1}` }),
      }),
    )
    renderDashboard('espresso', shots)

    expect(screen.getByText('Page 1 of 2')).toBeTruthy()
    expect(
      within(screen.getByRole('table')).queryByText('Coffee 6'),
    ).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next page'))
    })

    expect(screen.getByText('Page 2 of 2')).toBeTruthy()
    expect(within(screen.getByRole('table')).getByText('Coffee 6')).toBeTruthy()
  })

  it('lists every method alphabetically in the picker', () => {
    const { openPicker } = renderDashboard('espresso', [makeRecentShot()])
    openPicker()

    const options = screen
      .getAllByRole('option')
      // Each option row is "<label><relative time>"; take the label prefix.
      .map((o) => o.textContent)
    expect(options).toEqual([
      'AeroPressNo brews yet',
      'Cold BrewNo brews yet',
      'Espresso2d ago',
      'French PressNo brews yet',
      'Pour OverNo brews yet',
    ])
  })

  it('requests the chosen method via onSelectMethod when a picker row is chosen', async () => {
    const { onSelectMethod, openPicker } = renderDashboard('espresso', [
      makeRecentShot(),
    ])

    openPicker()
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /Pour Over/ }))
    })
    expect(onSelectMethod).toHaveBeenCalledWith('pourover')

    openPicker()
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /Cold Brew/ }))
    })
    expect(onSelectMethod).toHaveBeenCalledWith('coldbrew')
  })

  it('renders the Pour Over feed with its own log button and cards', () => {
    const { container } = renderDashboard('pourover', [makeRecentShot()], {
      pourover: [
        makePouroverBrew({
          coffee: makeRecentCoffee({ id: 'c9', name: 'Colombia Huila' }),
          brewTime: 165,
        }),
        makePouroverBrew({
          id: 'p2',
          coffee: makeRecentCoffee({ id: 'c10', name: 'Ethiopia Guji' }),
          coffeeId: 'c10',
          brewTime: 240,
        }),
        makePouroverBrew({
          id: 'p3',
          coffee: makeRecentCoffee({ id: 'c11', name: 'Kenya AA' }),
          coffeeId: 'c11',
          brewTime: 45,
        }),
        makePouroverBrew({
          id: 'p4',
          coffee: makeRecentCoffee({ id: 'c12', name: 'Brazil Cerrado' }),
          coffeeId: 'c12',
          brewTime: null,
        }),
      ],
    })

    // The feed, its log button, and its card all belong to Pour Over.
    expect(
      screen.getByRole('link', { name: /Log Brew/i }).getAttribute('href'),
    ).toBe('/pourover/new')
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Colombia Huila')).toBeTruthy()
    // The Method Variant shows for methods that have one.
    expect(table.getAllByText('Standard').length).toBeGreaterThan(0)
    // Brew time speaks minutes + seconds, collapsing empty parts, dash if none.
    expect(table.getByText('2m 45s')).toBeTruthy()
    expect(table.getByText('4m')).toBeTruthy()
    expect(table.getByText('45s')).toBeTruthy()
    expect(
      within(table.getByText('Brazil Cerrado').closest('tr')!).getByText('-'),
    ).toBeTruthy()

    const cards = container.querySelector<HTMLElement>('.lg\\:hidden')!
    expect(within(cards).getByText('2m 45s')).toBeTruthy()
    expect(within(cards).getByText('4m')).toBeTruthy()
    expect(within(cards).getByText('45s')).toBeTruthy()
    const noneCard = within(cards)
      .getByText('Brazil Cerrado')
      .closest('.rounded-lg') as HTMLElement
    const brewStat = within(noneCard).getByText('Brew').closest('div') as HTMLElement
    expect(within(brewStat).getByText('-')).toBeTruthy()
  })

  it('renders the French Press feed', () => {
    const { container } = renderDashboard('frenchpress', [makeRecentShot()], {
      frenchpress: [
        makeFrenchpressBrew({
          coffee: makeRecentCoffee({ id: 'c8', name: 'Brazil Cerrado' }),
          steepTime: 210,
        }),
        makeFrenchpressBrew({
          id: 'f2',
          coffee: makeRecentCoffee({ id: 'c13', name: 'Ethiopia Guji' }),
          coffeeId: 'c13',
          steepTime: 240,
        }),
        makeFrenchpressBrew({
          id: 'f3',
          coffee: makeRecentCoffee({ id: 'c14', name: 'Kenya AA' }),
          coffeeId: 'c14',
          steepTime: 45,
        }),
        makeFrenchpressBrew({
          id: 'f4',
          coffee: makeRecentCoffee({ id: 'c15', name: 'Colombia Huila' }),
          coffeeId: 'c15',
          steepTime: null,
        }),
      ],
    })

    expect(
      screen.getByRole('link', { name: /Log Brew/i }).getAttribute('href'),
    ).toBe('/frenchpress/new')
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Brazil Cerrado')).toBeTruthy()
    // Steep time speaks minutes + seconds, collapsing empty parts, dash if none.
    expect(table.getByText('3m 30s')).toBeTruthy()
    expect(table.getByText('4m')).toBeTruthy()
    expect(table.getByText('45s')).toBeTruthy()
    expect(
      within(table.getByText('Colombia Huila').closest('tr')!).getByText('-'),
    ).toBeTruthy()

    const cards = container.querySelector<HTMLElement>('.lg\\:hidden')!
    expect(within(cards).getByText('3m 30s')).toBeTruthy()
    expect(within(cards).getByText('4m')).toBeTruthy()
    expect(within(cards).getByText('45s')).toBeTruthy()
    const noneCard = within(cards)
      .getByText('Colombia Huila')
      .closest('.rounded-lg') as HTMLElement
    const steepStat = within(noneCard)
      .getByText('Steep')
      .closest('div') as HTMLElement
    expect(within(steepStat).getByText('-')).toBeTruthy()
  })

  it('renders the AeroPress feed', () => {
    renderDashboard('aeropress', [makeRecentShot()], {
      aeropress: [
        makeAeropressBrew({
          coffee: makeRecentCoffee({ id: 'c7', name: 'Guatemala Antigua' }),
        }),
      ],
    })

    expect(
      screen.getByRole('link', { name: /Log Brew/i }).getAttribute('href'),
    ).toBe('/aeropress/new')
    expect(
      within(screen.getByRole('table')).getByText('Guatemala Antigua'),
    ).toBeTruthy()
  })

  it('shows Cold Brew with no Method Variant, minute-scale steep, and Brew Environment', async () => {
    renderDashboard('coldbrew', [makeRecentShot()], {
      coldbrew: [
        makeColdBrewBrew({
          coffee: makeRecentCoffee({ id: 'c6', name: 'Peru Cajamarca' }),
        }),
      ],
    })

    expect(
      screen.getByRole('link', { name: /Log Brew/i }).getAttribute('href'),
    ).toBe('/cold-brew/new')
    const table = within(screen.getByRole('table'))
    // Methodless: no "Method" header column.
    expect(table.queryByText('Method')).toBeNull()
    // Steep reads in hours/minutes, not seconds (1080 min = 18h).
    expect(table.getByText('18h')).toBeTruthy()

    // Brew Environment surfaces in the expander.
    await act(async () => {
      fireEvent.click(table.getByText('Peru Cajamarca').closest('tr')!)
    })
    expect(table.getByText(/Brew Environment/)).toBeTruthy()
    expect(table.getByText('Fridge')).toBeTruthy()
  })

  it('shows a per-method empty state for the selected method', () => {
    renderDashboard('pourover', [makeRecentShot()])
    expect(screen.getByText(/No pour over brews yet/i)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /Log your first pour over brew/i }),
    ).toBeTruthy()
  })

  it('shows the Cold Brew empty state when it is the selected method', () => {
    renderDashboard('coldbrew', [makeRecentShot()])
    expect(screen.getByText(/No cold brews yet/i)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /Log your first cold brew/i }),
    ).toBeTruthy()
  })

  it('retries a failed espresso load-more from the error', async () => {
    const extra = makeRecentShot({
      id: 's-next',
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
      const shots = Array.from({ length: ESPRESSO_SHOT_PAGE_SIZE }, (_, index) =>
        makeRecentShot({
          id: `s${index}`,
          coffeeId: `c${index}`,
          coffee: makeRecentCoffee({ id: `c${index}`, name: `Coffee ${index}` }),
        }),
      )
      const { queryClient, trpc, Wrapper } = seed(shots)
      seedEspressoShotPage(queryClient, trpc, shots, shots.length + 1)
      render(
        <Dashboard
          selectedMethod="espresso"
          onSelectMethod={vi.fn()}
          feeds={[
            { method: 'espresso', brews: shots },
            { method: 'pourover', brews: [] },
            { method: 'frenchpress', brews: [] },
            { method: 'aeropress', brews: [] },
            { method: 'coldbrew', brews: [] },
          ]}
          now={NOW}
        />,
        { wrapper: Wrapper },
      )

      fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
      expect(
        await screen.findByText("We couldn't load more shots. Try again."),
      ).toBeTruthy()
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      await waitFor(() => {
        expect(
          screen.queryByText("We couldn't load more shots. Try again."),
        ).toBeNull()
      })
      expect(fetchSpy).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
      for (let step = 0; step < 4; step += 1) {
        fireEvent.click(screen.getByLabelText('Next page'))
      }
      expect(
        within(screen.getByRole('table')).getByText('Coffee extra'),
      ).toBeTruthy()
    } finally {
      fetchSpy.mockRestore()
    }
  })
})

