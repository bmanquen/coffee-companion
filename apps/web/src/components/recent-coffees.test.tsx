import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createTestProviders } from '@/test/providers'
import { makeRecentCoffee } from '@/test/factories'
import { RecentCoffees } from './recent-coffees'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
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
    expect(screen.getByText('Ethiopia Guji')).toBeTruthy()
  })
})
