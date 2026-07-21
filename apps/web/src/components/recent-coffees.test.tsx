import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RecentCoffees } from './recent-coffees'
import type * as ReactRouter from '@tanstack/react-router'
import { createTestProviders } from '@/test/providers'
import { makeRecentCoffee } from '@/test/factories'

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

describe('RecentCoffees', () => {
  it('shows the empty state when there are no coffees', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.coffee.getRecent.queryKey({ limit: 5, offset: 0 }),
      { items: [], total: 0 },
    )
    render(<RecentCoffees />, { wrapper: Wrapper })
    expect(screen.getByText(/No coffees yet/i)).toBeTruthy()
  })

  it('renders the coffees', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.coffee.getRecent.queryKey({ limit: 5, offset: 0 }),
      { items: [makeRecentCoffee()], total: 1 },
    )
    render(<RecentCoffees />, { wrapper: Wrapper })
    expect(screen.getByText('Recent Coffees')).toBeTruthy()
    // Scope to the desktop <table>; the mobile card layout renders in parallel.
    expect(
      within(screen.getByRole('table')).getByText('Ethiopia Guji'),
    ).toBeTruthy()
  })

  it('advances to the next page of coffees', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    // total > PAGE_SIZE so a second page (and the controls) exist. Seed both
    // pages so the swap is instant and we can assert the new rows render.
    queryClient.setQueryData(
      trpc.coffee.getRecent.queryKey({ limit: 5, offset: 0 }),
      { items: [makeRecentCoffee({ name: 'Ethiopia Guji' })], total: 6 },
    )
    queryClient.setQueryData(
      trpc.coffee.getRecent.queryKey({ limit: 5, offset: 5 }),
      { items: [makeRecentCoffee({ id: 'c2', name: 'Kenya AA' })], total: 6 },
    )
    render(<RecentCoffees />, { wrapper: Wrapper })

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
})
