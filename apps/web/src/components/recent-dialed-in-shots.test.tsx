import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MAX_SHOTS, RecentDialedInShots } from './recent-dialed-in-shots'
import { createTestProviders } from '@/test/providers'
import { makeRecentShot } from '@/test/factories'

describe('RecentDialedInShots', () => {
  it('renders nothing when there are no dialed-in shots', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.espressoShot.getDialedIn.queryKey({ limit: MAX_SHOTS }),
      [],
    )
    const { container } = render(<RecentDialedInShots />, { wrapper: Wrapper })
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText('Recent Dialed In')).toBeNull()
  })

  it('renders shots and shows the brew ratio when a row is expanded', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.espressoShot.getDialedIn.queryKey({ limit: MAX_SHOTS }),
      [makeRecentShot()],
    )
    render(<RecentDialedInShots />, { wrapper: Wrapper })

    expect(screen.getByText('Recent Dialed In')).toBeTruthy()
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
})
