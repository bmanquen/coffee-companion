import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Dashboard, LandingPage } from './index'
import type * as ReactRouter from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { DashboardMethod } from '@/components/dashboard/methods'
import { dashboardMethods } from '@/components/dashboard/methods'
import { createTestProviders } from '@/test/providers'
import {
  makeAeropressBrew,
  makeColdBrewBrew,
  makeFrenchpressBrew,
  makePouroverBrew,
  makeRecentCoffee,
  makeRecentShot,
} from '@/test/factories'

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

// Seed every method's getAll so any tab can render; each defaults to empty and
// is overridden per test. Espresso accepts the bare-array shorthand the older
// tests already pass.
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
  queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), shots)
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
) {
  const providers = seed(shots, others)
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

  it('narrows the feed to dialed-in shots when the toggle is on', async () => {
    renderDashboard('espresso', [
      makeRecentShot({
        id: 's1',
        isDialedIn: true,
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makeRecentShot({
        id: 's2',
        isDialedIn: false,
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Kenya AA' }),
      }),
    ])

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
    renderDashboard('espresso', [
      makeRecentShot({
        id: 's1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makeRecentShot({
        id: 's2',
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Kenya AA' }),
      }),
    ])

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
    renderDashboard('pourover', [makeRecentShot()], {
      pourover: [
        makePouroverBrew({
          coffee: makeRecentCoffee({ id: 'c9', name: 'Colombia Huila' }),
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
    expect(table.getByText('Standard')).toBeTruthy()
  })

  it('renders the French Press feed', () => {
    renderDashboard('frenchpress', [makeRecentShot()], {
      frenchpress: [
        makeFrenchpressBrew({
          coffee: makeRecentCoffee({ id: 'c8', name: 'Brazil Cerrado' }),
        }),
      ],
    })

    expect(
      screen.getByRole('link', { name: /Log Brew/i }).getAttribute('href'),
    ).toBe('/frenchpress/new')
    expect(
      within(screen.getByRole('table')).getByText('Brazil Cerrado'),
    ).toBeTruthy()
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
})

describe('LandingPage', () => {
  it('is unchanged — still offers Google sign-in', () => {
    render(<LandingPage />)
    expect(
      screen.getByRole('button', { name: /Sign in with Google/i }),
    ).toBeTruthy()
  })
})
