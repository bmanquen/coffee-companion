import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Dashboard, LandingPage } from './index'
import type * as ReactRouter from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { createTestProviders } from '@/test/providers'
import { makeRecentCoffee, makeRecentShot } from '@/test/factories'

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

function seed(shots: Array<ReturnType<typeof makeRecentShot>>) {
  const providers = createTestProviders()
  providers.queryClient.setQueryData(
    providers.trpc.espressoShot.getAll.queryKey(),
    shots,
  )
  return providers
}

describe('Dashboard', () => {
  it('renders a method switcher with the Espresso tab selected, and none of the old cards', () => {
    const { Wrapper } = seed([makeRecentShot()])
    render(<Dashboard />, { wrapper: Wrapper })

    const tab = screen.getByRole('tab', { name: 'Espresso' })
    expect(tab.getAttribute('aria-selected')).toBe('true')

    // The eight previous stacked cards are gone.
    expect(screen.queryByText('Recent Espresso Shots')).toBeNull()
    expect(screen.queryByText('Recent Coffees')).toBeNull()
    expect(screen.queryByText(/Dialed-in Shots/i)).toBeNull()
  })

  it('shows each shot with a hero ratio and core stats on the face', () => {
    const { Wrapper } = seed([makeRecentShot()])
    render(<Dashboard />, { wrapper: Wrapper })

    // Scope to the desktop table; the mobile card layout renders in parallel.
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Ethiopia Guji')).toBeTruthy()
    // Hero ratio is on the face — no expansion needed.
    expect(table.getByText('1:2.0')).toBeTruthy()
    expect(table.getByText('18g')).toBeTruthy()
    expect(table.getByText('36g')).toBeTruthy()
    expect(table.getByText('28s')).toBeTruthy()
  })

  it('highlights a dialed-in shot with the icon and a row highlight', () => {
    const { Wrapper } = seed([makeRecentShot({ isDialedIn: true })])
    render(<Dashboard />, { wrapper: Wrapper })
    const table = within(screen.getByRole('table'))
    expect(table.getByLabelText('Dialed in')).toBeTruthy()
    // The dialed-in reference row is visually highlighted, not just badged.
    const row = table.getByText('Ethiopia Guji').closest('tr')!
    expect(row.className).toContain('bg-primary/10')
  })

  it('does not highlight a regular shot', () => {
    const { Wrapper } = seed([makeRecentShot({ isDialedIn: false })])
    render(<Dashboard />, { wrapper: Wrapper })
    const table = within(screen.getByRole('table'))
    expect(table.queryByLabelText('Dialed in')).toBeNull()
    const row = table.getByText('Ethiopia Guji').closest('tr')!
    expect(row.className).not.toContain('bg-primary/10')
  })

  it('reveals grinder and days off roast when a shot is expanded', async () => {
    const { Wrapper } = seed([makeRecentShot({ roastDate: '2026-05-25' })])
    render(<Dashboard />, { wrapper: Wrapper })
    const table = within(screen.getByRole('table'))

    await act(async () => {
      fireEvent.click(table.getByText('Ethiopia Guji').closest('tr')!)
    })
    expect(table.getByText(/Niche Zero/)).toBeTruthy()
    expect(table.getByText('7d')).toBeTruthy()
  })

  it('offers a Log Shot button to start a new espresso shot', () => {
    const { Wrapper } = seed([makeRecentShot()])
    render(<Dashboard />, { wrapper: Wrapper })
    const link = screen.getByRole('link', { name: /Log Shot/i })
    expect(link.getAttribute('href')).toBe('/espresso/new')
  })

  it('shows an empty state when there are no shots', () => {
    const { Wrapper } = seed([])
    render(<Dashboard />, { wrapper: Wrapper })
    expect(screen.getByText(/No espresso shots yet/i)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /Log your first shot/i }),
    ).toBeTruthy()
  })

  it('narrows the feed to dialed-in shots when the toggle is on', async () => {
    const { Wrapper } = seed([
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
    render(<Dashboard />, { wrapper: Wrapper })

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
    const { Wrapper } = seed([
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
    render(<Dashboard />, { wrapper: Wrapper })

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
    const { Wrapper } = seed(shots)
    render(<Dashboard />, { wrapper: Wrapper })

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
})

describe('LandingPage', () => {
  it('is unchanged — still offers Google sign-in', () => {
    render(<LandingPage />)
    expect(
      screen.getByRole('button', { name: /Sign in with Google/i }),
    ).toBeTruthy()
  })
})
