import { render, screen, within } from '@testing-library/react'
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
})
