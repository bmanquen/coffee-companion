import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RecentColdBrewBrews } from './recent-cold-brew-brews'
import type * as ReactRouter from '@tanstack/react-router'
import { createTestProviders } from '@/test/providers'
import { makeColdBrewBrew, makeRecentCoffee } from '@/test/factories'

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

describe('RecentColdBrewBrews', () => {
  it('shows the empty state when there are no brews', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.coldBrewBrew.getRecent.queryKey({ limit: 5, offset: 0 }),
      { items: [], total: 0 },
    )
    render(<RecentColdBrewBrews />, { wrapper: Wrapper })
    expect(screen.getByText(/No cold brews yet/i)).toBeTruthy()
  })

  it('renders brews and shows the ratio and environment when a row is expanded', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.coldBrewBrew.getRecent.queryKey({ limit: 5, offset: 0 }),
      {
        items: [
          makeColdBrewBrew({
            dose: '50',
            water: '500',
            steepTime: 1080,
            brewEnvironment: 'Fridge',
            coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
          }),
        ],
        total: 1,
      },
    )
    render(<RecentColdBrewBrews />, { wrapper: Wrapper })

    expect(screen.getByText('Recent Cold Brews')).toBeTruthy()
    // Scope to the desktop <table>; the mobile card layout renders in parallel.
    const table = within(screen.getByRole('table'))
    expect(table.getByText('18h')).toBeTruthy() // 1080 min -> 18h
    const cell = table.getByText('Ethiopia Guji')

    await act(async () => {
      fireEvent.click(cell.closest('tr')!)
    })
    // ratio = water / dose = 500 / 50 = 10.0
    expect(table.getByText('1:10.0')).toBeTruthy()
    expect(table.getByText('Fridge')).toBeTruthy()
    expect(table.getByText(/Ode/)).toBeTruthy()
  })

  it('advances to the next page of brews', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    // total > PAGE_SIZE so a second page (and the controls) exist. Seed both
    // pages so the swap is instant and we can assert the new rows render.
    queryClient.setQueryData(
      trpc.coldBrewBrew.getRecent.queryKey({ limit: 5, offset: 0 }),
      {
        items: [
          makeColdBrewBrew({
            id: 'cb1',
            coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
          }),
        ],
        total: 6,
      },
    )
    queryClient.setQueryData(
      trpc.coldBrewBrew.getRecent.queryKey({ limit: 5, offset: 5 }),
      {
        items: [
          makeColdBrewBrew({
            id: 'cb2',
            coffee: makeRecentCoffee({ id: 'c2', name: 'Kenya AA' }),
          }),
        ],
        total: 6,
      },
    )
    render(<RecentColdBrewBrews />, { wrapper: Wrapper })

    expect(screen.getByText('1 of 2')).toBeTruthy()
    expect(
      within(screen.getByRole('table')).getByText('Ethiopia Guji'),
    ).toBeTruthy()

    // The next-page control is the last button in the pagination row.
    const controls = screen.getByText('1 of 2').parentElement!
    const buttons = within(controls).getAllByRole('button')
    fireEvent.click(buttons[buttons.length - 1])

    expect(await screen.findByText('2 of 2')).toBeTruthy()
    expect(within(screen.getByRole('table')).getByText('Kenya AA')).toBeTruthy()
    expect(
      within(screen.getByRole('table')).queryByText('Ethiopia Guji'),
    ).toBeNull()
  })

  it('marks a dialed-in brew with the dialed-in icon', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.coldBrewBrew.getRecent.queryKey({ limit: 5, offset: 0 }),
      { items: [makeColdBrewBrew({ isDialedIn: true })], total: 1 },
    )
    render(<RecentColdBrewBrews />, { wrapper: Wrapper })
    const table = within(screen.getByRole('table'))
    expect(table.getByLabelText('Dialed in')).toBeTruthy()
  })

  it('does not show the dialed-in icon for a regular brew', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.coldBrewBrew.getRecent.queryKey({ limit: 5, offset: 0 }),
      { items: [makeColdBrewBrew({ isDialedIn: false })], total: 1 },
    )
    render(<RecentColdBrewBrews />, { wrapper: Wrapper })
    const table = within(screen.getByRole('table'))
    expect(table.queryByLabelText('Dialed in')).toBeNull()
  })

  it('renders dashes for missing dose/water/steep/grind values', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.coldBrewBrew.getRecent.queryKey({ limit: 5, offset: 0 }),
      {
        items: [
          makeColdBrewBrew({
            roastDate: null,
            dose: null,
            water: null,
            steepTime: null,
            grindSetting: null,
          }),
        ],
        total: 1,
      },
    )
    render(<RecentColdBrewBrews />, { wrapper: Wrapper })
    expect(screen.getAllByText('-').length).toBeGreaterThan(0)
  })
})
