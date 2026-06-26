import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createTestProviders } from '@/test/providers'
import { makeRecentShot } from '@/test/factories'
import { MAX_SHOTS, RecentDialedInShots } from './recent-dialed-in-shots'

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
    const cell = screen.getByText('Ethiopia Guji')
    expect(cell).toBeTruthy()

    // Expand the row to reveal ShotDetails (which formats the brew ratio).
    await act(async () => {
      fireEvent.click(cell.closest('tr')!)
    })
    expect(screen.getByText('1:2.0')).toBeTruthy()
    expect(screen.getByText(/Niche Zero/)).toBeTruthy()
  })
})
