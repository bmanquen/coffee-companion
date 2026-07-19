import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DialedInColdBrewBrews, MAX_BREWS } from './dialed-in-cold-brew-brews'
import { createTestProviders } from '@/test/providers'
import { makeColdBrewBrew, makeRecentCoffee } from '@/test/factories'

describe('DialedInColdBrewBrews', () => {
  it('renders nothing when there are no dialed-in brews', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.coldBrewBrew.getDialedIn.queryKey({ limit: MAX_BREWS }),
      [],
    )
    const { container } = render(<DialedInColdBrewBrews />, { wrapper: Wrapper })
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText('Dialed In Cold Brew')).toBeNull()
  })

  it('renders the dialed-in brew and shows the ratio and environment when expanded', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.coldBrewBrew.getDialedIn.queryKey({ limit: MAX_BREWS }),
      [
        makeColdBrewBrew({
          id: 'cb1',
          dose: '50',
          water: '500',
          steepTime: 1080,
          brewEnvironment: 'Fridge',
          coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        }),
      ],
    )
    render(<DialedInColdBrewBrews />, { wrapper: Wrapper })

    expect(screen.getByText('Dialed In Cold Brew')).toBeTruthy()
    // Scope to the desktop <table>; the mobile card layout renders in parallel.
    const table = within(screen.getByRole('table'))
    expect(table.getByText('18h')).toBeTruthy() // 1080 min -> 18h

    // Expand the row to reveal BrewDetails (ratio = water / dose = 500/50).
    const cell = table.getAllByText('Ethiopia Guji')[0]
    await act(async () => {
      fireEvent.click(cell.closest('tr')!)
    })
    expect(table.getByText('1:10.0')).toBeTruthy()
    expect(table.getByText('Fridge')).toBeTruthy()
    expect(table.getByText(/Toddy/)).toBeTruthy()
  })

  it('renders dashes for a brew with missing recipe values', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(
      trpc.coldBrewBrew.getDialedIn.queryKey({ limit: MAX_BREWS }),
      [
        makeColdBrewBrew({
          id: 'cb1',
          roastDate: null,
          dose: null,
          water: null,
          steepTime: null,
          grindSetting: null,
        }),
      ],
    )
    render(<DialedInColdBrewBrews />, { wrapper: Wrapper })

    // days-off-roast / dose / water / steep / grind all fall back to "-".
    const table = within(screen.getByRole('table'))
    expect(table.getAllByText('-').length).toBeGreaterThanOrEqual(5)
  })
})
