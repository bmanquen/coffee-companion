import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RecentEspressoShots } from './recent-espresso-shots'
import type * as ReactRouter from '@tanstack/react-router'
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

describe('RecentEspressoShots', () => {
  it('shows the empty state when there are no shots', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.espressoShot.getRecent.queryKey({ limit: 5, offset: 0 }),
      { items: [], total: 0 },
    )
    render(<RecentEspressoShots />, { wrapper: Wrapper })
    expect(screen.getByText(/No espresso shots yet/i)).toBeTruthy()
  })

  it('renders shots and shows the brew ratio when a row is expanded', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.espressoShot.getRecent.queryKey({ limit: 5, offset: 0 }),
      { items: [makeRecentShot()], total: 1 },
    )
    render(<RecentEspressoShots />, { wrapper: Wrapper })

    expect(screen.getByText('Recent Espresso Shots')).toBeTruthy()
    // Scope to the desktop <table>; the mobile card layout renders in parallel.
    const table = within(screen.getByRole('table'))
    const cell = table.getByText('Ethiopia Guji')
    expect(cell).toBeTruthy()

    // Expand the row to reveal ShotDetails (which formats the brew ratio).
    await act(async () => {
      fireEvent.click(cell.closest('tr')!)
    })
    expect(table.getByText('1:2.0')).toBeTruthy()
    expect(table.getByText(/Niche Zero/)).toBeTruthy()
  })

  it('advances to the next page of shots', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    // total > PAGE_SIZE so a second page (and the controls) exist. Seed both
    // pages so the swap is instant and we can assert the new rows render.
    queryClient.setQueryData(
      trpc.espressoShot.getRecent.queryKey({ limit: 5, offset: 0 }),
      {
        items: [makeRecentShot({ coffee: makeRecentCoffee({ name: 'Ethiopia Guji' }) })],
        total: 6,
      },
    )
    queryClient.setQueryData(
      trpc.espressoShot.getRecent.queryKey({ limit: 5, offset: 5 }),
      {
        items: [
          makeRecentShot({
            id: 's2',
            coffee: makeRecentCoffee({ id: 'c2', name: 'Kenya AA' }),
          }),
        ],
        total: 6,
      },
    )
    render(<RecentEspressoShots />, { wrapper: Wrapper })

    expect(screen.getByText('1 of 2')).toBeTruthy()
    expect(within(screen.getByRole('table')).getByText('Ethiopia Guji')).toBeTruthy()

    // The next-page control is the last button in the pagination row.
    const controls = screen.getByText('1 of 2').parentElement!
    const buttons = within(controls).getAllByRole('button')
    fireEvent.click(buttons[buttons.length - 1])

    expect(await screen.findByText('2 of 2')).toBeTruthy()
    expect(within(screen.getByRole('table')).getByText('Kenya AA')).toBeTruthy()
    expect(within(screen.getByRole('table')).queryByText('Ethiopia Guji')).toBeNull()
  })

  it('marks a dialed-in shot with the dialed-in icon', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.espressoShot.getRecent.queryKey({ limit: 5, offset: 0 }),
      { items: [makeRecentShot({ isDialedIn: true })], total: 1 },
    )
    render(<RecentEspressoShots />, { wrapper: Wrapper })
    // Scope to the desktop table so the parallel mobile card isn't a 2nd match.
    const table = within(screen.getByRole('table'))
    expect(table.getByLabelText('Dialed in')).toBeTruthy()
  })

  it('does not show the dialed-in icon for a regular shot', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.espressoShot.getRecent.queryKey({ limit: 5, offset: 0 }),
      { items: [makeRecentShot({ isDialedIn: false })], total: 1 },
    )
    render(<RecentEspressoShots />, { wrapper: Wrapper })
    const table = within(screen.getByRole('table'))
    expect(table.queryByLabelText('Dialed in')).toBeNull()
  })

  it('renders dashes for missing dose/yield/time values', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.espressoShot.getRecent.queryKey({ limit: 5, offset: 0 }),
      {
        items: [
          makeRecentShot({
            dose: null,
            yield: null,
            time: null,
            grindSetting: null,
          }),
        ],
        total: 1,
      },
    )
    render(<RecentEspressoShots />, { wrapper: Wrapper })
    expect(screen.getAllByText('-').length).toBeGreaterThan(0)
  })
})
