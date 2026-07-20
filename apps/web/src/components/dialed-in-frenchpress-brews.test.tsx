import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  DialedInFrenchpressBrews,
  MAX_BREWS,
} from './dialed-in-frenchpress-brews'
import { createTestProviders } from '@/test/providers'
import { makeFrenchpressBrew } from '@/test/factories'

describe('DialedInFrenchpressBrews', () => {
  it('renders nothing when there are no dialed-in brews', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.frenchpressBrew.getDialedIn.queryKey({ limit: MAX_BREWS }),
      [],
    )
    const { container } = render(<DialedInFrenchpressBrews />, {
      wrapper: Wrapper,
    })
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText('Dialed In French Press')).toBeNull()
  })

  it('renders each method’s dialed-in brew and shows the ratio and temp when expanded', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.frenchpressBrew.getDialedIn.queryKey({ limit: MAX_BREWS }),
      [
        makeFrenchpressBrew({
          id: 'f-standard',
          method: {
            id: 'm1',
            userId: null,
            name: 'Standard',
            createdAt: new Date('2026-06-01T08:00:00.000Z'),
            updatedAt: new Date('2026-06-15T10:30:00.000Z'),
          },
        }),
        makeFrenchpressBrew({
          id: 'f-hoffmann',
          method: {
            id: 'm2',
            userId: null,
            name: 'Hoffmann',
            createdAt: new Date('2026-06-01T08:00:00.000Z'),
            updatedAt: new Date('2026-06-15T10:30:00.000Z'),
          },
        }),
      ],
    )
    render(<DialedInFrenchpressBrews />, { wrapper: Wrapper })

    expect(screen.getByText('Dialed In French Press')).toBeTruthy()
    // Scope to the desktop <table>; the mobile card layout renders in parallel.
    const table = within(screen.getByRole('table'))
    // Both methods are shown.
    expect(table.getByText('Standard')).toBeTruthy()
    expect(table.getByText('Hoffmann')).toBeTruthy()

    // Expand the first row to reveal BrewDetails (ratio = water / dose = 500/30).
    const cell = table.getAllByText('Ethiopia Guji')[0]
    await act(async () => {
      fireEvent.click(cell.closest('tr')!)
    })
    expect(table.getByText('1:16.7')).toBeTruthy()
    expect(table.getByText(/Chambord/)).toBeTruthy()
    expect(table.getByText('95°C')).toBeTruthy()
  })

  it('renders dashes for a brew with missing recipe values', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.frenchpressBrew.getDialedIn.queryKey({ limit: MAX_BREWS }),
      [
        makeFrenchpressBrew({
          id: 'f1',
          roastDate: null,
          dose: null,
          water: null,
          steepTime: null,
          waterTemp: null,
          grindSetting: null,
        }),
      ],
    )
    render(<DialedInFrenchpressBrews />, { wrapper: Wrapper })

    // days-off-roast / dose / water / steep / grind all fall back to "-".
    const table = within(screen.getByRole('table'))
    expect(table.getAllByText('-').length).toBeGreaterThanOrEqual(5)
  })
})
