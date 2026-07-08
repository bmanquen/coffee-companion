import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DialedInAeropressBrews, MAX_BREWS } from './dialed-in-aeropress-brews'
import { createTestProviders } from '@/test/providers'
import { makeAeropressBrew } from '@/test/factories'

describe('DialedInAeropressBrews', () => {
  it('renders nothing when there are no dialed-in brews', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.aeropressBrew.getDialedIn.queryKey({ limit: MAX_BREWS }),
      [],
    )
    const { container } = render(<DialedInAeropressBrews />, {
      wrapper: Wrapper,
    })
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText('Dialed In AeroPress')).toBeNull()
  })

  it('renders each method’s dialed-in brew and shows the ratio when expanded', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.aeropressBrew.getDialedIn.queryKey({ limit: MAX_BREWS }),
      [
        makeAeropressBrew({
          id: 'a-standard',
          method: {
            id: 'm1',
            userId: null,
            name: 'Standard',
            createdAt: new Date('2026-06-01T08:00:00.000Z'),
            updatedAt: new Date('2026-06-15T10:30:00.000Z'),
          },
        }),
        makeAeropressBrew({
          id: 'a-inverted',
          method: {
            id: 'm2',
            userId: null,
            name: 'Inverted',
            createdAt: new Date('2026-06-01T08:00:00.000Z'),
            updatedAt: new Date('2026-06-15T10:30:00.000Z'),
          },
        }),
      ],
    )
    render(<DialedInAeropressBrews />, { wrapper: Wrapper })

    expect(screen.getByText('Dialed In AeroPress')).toBeTruthy()
    // Scope to the desktop <table>; the mobile card layout renders in parallel.
    const table = within(screen.getByRole('table'))
    // Both methods are shown.
    expect(table.getByText('Standard')).toBeTruthy()
    expect(table.getByText('Inverted')).toBeTruthy()

    // Expand the first row to reveal BrewDetails (ratio = water / dose = 220/15).
    const cell = table.getAllByText('Ethiopia Guji')[0]
    await act(async () => {
      fireEvent.click(cell.closest('tr')!)
    })
    expect(table.getByText('1:14.7')).toBeTruthy()
    expect(table.getByText(/AeroPress Go/)).toBeTruthy()
  })

  it('renders dashes for a brew with missing recipe values', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.aeropressBrew.getDialedIn.queryKey({ limit: MAX_BREWS }),
      [
        makeAeropressBrew({
          id: 'a1',
          roastDate: null,
          dose: null,
          water: null,
          steepTime: null,
          grindSetting: null,
        }),
      ],
    )
    render(<DialedInAeropressBrews />, { wrapper: Wrapper })

    // days-off-roast / dose / water / steep / grind all fall back to "-".
    const table = within(screen.getByRole('table'))
    expect(table.getAllByText('-').length).toBeGreaterThanOrEqual(5)
  })
})
