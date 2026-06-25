import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createTestProviders } from '@/test/providers'
import { makeRecentShot } from '@/test/factories'
import { RecentEspressoShots } from './recent-espresso-shots'

// Link needs router context; swap it for a plain anchor for unit rendering.
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
    const cell = screen.getByText('Ethiopia Guji')
    expect(cell).toBeTruthy()

    // Expand the row to reveal ShotDetails (which formats the brew ratio).
    await act(async () => {
      fireEvent.click(cell.closest('tr')!)
    })
    expect(screen.getByText('1:2.0')).toBeTruthy()
    expect(screen.getByText(/Niche Zero/)).toBeTruthy()
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
