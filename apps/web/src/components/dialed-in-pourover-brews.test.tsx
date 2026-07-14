import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DialedInPouroverBrews, MAX_BREWS } from './dialed-in-pourover-brews'
import { createTestProviders } from '@/test/providers'
import { makePouroverBrew } from '@/test/factories'

describe('DialedInPouroverBrews', () => {
  it('renders nothing when there are no dialed-in brews', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.pouroverBrew.getDialedIn.queryKey({ limit: MAX_BREWS }),
      [],
    )
    const { container } = render(<DialedInPouroverBrews />, {
      wrapper: Wrapper,
    })
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText('Dialed In Pour Over')).toBeNull()
  })

  it('renders each method’s dialed-in brew and shows the ratio and temp when expanded', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.pouroverBrew.getDialedIn.queryKey({ limit: MAX_BREWS }),
      [
        makePouroverBrew({
          id: 'p-standard',
          method: {
            id: 'm1',
            userId: null,
            name: 'Standard',
            createdAt: new Date('2026-06-01T08:00:00.000Z'),
            updatedAt: new Date('2026-06-15T10:30:00.000Z'),
          },
        }),
        makePouroverBrew({
          id: 'p-pulse',
          method: {
            id: 'm2',
            userId: null,
            name: 'Pulse',
            createdAt: new Date('2026-06-01T08:00:00.000Z'),
            updatedAt: new Date('2026-06-15T10:30:00.000Z'),
          },
        }),
      ],
    )
    render(<DialedInPouroverBrews />, { wrapper: Wrapper })

    expect(screen.getByText('Dialed In Pour Over')).toBeTruthy()
    // Scope to the desktop <table>; the mobile card layout renders in parallel.
    const table = within(screen.getByRole('table'))
    // Both methods are shown.
    expect(table.getByText('Standard')).toBeTruthy()
    expect(table.getByText('Pulse')).toBeTruthy()

    // Expand the first row to reveal BrewDetails (ratio = water / dose = 300/18).
    const cell = table.getAllByText('Ethiopia Guji')[0]
    await act(async () => {
      fireEvent.click(cell.closest('tr')!)
    })
    expect(table.getByText('1:16.7')).toBeTruthy()
    expect(table.getByText(/V60/)).toBeTruthy()
    expect(table.getByText('94°C')).toBeTruthy()
  })

  it('renders dashes for a brew with missing recipe values', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.pouroverBrew.getDialedIn.queryKey({ limit: MAX_BREWS }),
      [
        makePouroverBrew({
          id: 'p1',
          roastDate: null,
          dose: null,
          water: null,
          brewTime: null,
          waterTemp: null,
          grindSetting: null,
        }),
      ],
    )
    render(<DialedInPouroverBrews />, { wrapper: Wrapper })

    // days-off-roast / dose / water / brew / grind all fall back to "-".
    const table = within(screen.getByRole('table'))
    expect(table.getAllByText('-').length).toBeGreaterThanOrEqual(5)
  })
})
