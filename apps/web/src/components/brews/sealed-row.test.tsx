import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EspressoBrewsSection } from './espresso-brews-section'
import type { ReactNode } from 'react'
import { createTestProviders } from '@/test/providers'
import { makeRecentCoffee, makeRecentShot } from '@/test/factories'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}))

const coffee = makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' })

describe('a Sealed row', () => {
  it('is marked Sealed and offers no edit, delete or detail', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), [
      makeRecentShot({
        id: 'sealed',
        coffee,
        coffeeId: 'c1',
        sealed: true,
        sealedAt: new Date('2026-07-01T00:00:00.000Z'),
        dose: null,
        yield: null,
        time: null,
        grinder: null,
        brewingDevice: null,
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    // The desktop table and the mobile cards both render, so each appears twice.
    expect((await screen.findAllByText(/^Sealed —/)).length).toBeGreaterThan(0)
    expect(screen.queryAllByRole('button', { name: /edit/i })).toEqual([])
    expect(screen.queryAllByRole('button', { name: /delete/i })).toEqual([])

    // A way out, and no dashes pretending the settings were never recorded.
    // A button to the eye, an anchor to the browser.
    const unlock = await screen.findAllByRole('link', { name: 'Unlock' })
    expect(unlock[0].getAttribute('href')).toBe('/pricing')
    expect(
      (await screen.findAllByText(/sealed — subscribe to pro to/i)).length,
    ).toBeGreaterThan(0)
    expect(screen.queryAllByText('-')).toEqual([])

    // The user can still see which coffee they would be unlocking.
    expect((await screen.findAllByText('Ethiopia Guji')).length).toBeGreaterThan(
      0,
    )
  })

  it('keeps edit and delete on a readable row', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), [
      makeRecentShot({ id: 'readable', coffee, coffeeId: 'c1' }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    // The control: without this, the assertions above would pass on a row that
    // simply failed to render.
    expect(
      (await screen.findAllByRole('button', { name: /edit/i })).length,
    ).toBeGreaterThan(0)
    expect(screen.queryAllByText(/^Sealed —/)).toEqual([])
  })
})

describe('the table header', () => {
  it('does not highlight on hover, and takes nothing from a Sealed row', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), [
      makeRecentShot({
        id: 'sealed',
        coffee,
        coffeeId: 'c1',
        sealed: true,
        sealedAt: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })
    await screen.findAllByText(/^Sealed —/)

    const headerRow = document.querySelector('thead tr')
    // Body rows highlight on hover; the header shares the primitive and must
    // not. It also takes nothing from a Sealed row's muting.
    expect(document.querySelector('thead')?.className).toContain(
      '[&_tr:hover]:bg-transparent',
    )
    expect(headerRow?.className).not.toContain('text-muted-foreground')
    expect(headerRow?.className).not.toContain('opacity-70')
  })
})

describe('column alignment', () => {
  it('leaves a Sealed row’s coffee in the same column as a readable one', async () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), [
      makeRecentShot({ id: 'readable', coffee, coffeeId: 'c1' }),
      makeRecentShot({
        id: 'sealed',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Kenya Nyeri' }),
        coffeeId: 'c2',
        sealed: true,
        sealedAt: new Date('2026-07-01T00:00:00.000Z'),
        dose: null,
        yield: null,
        time: null,
        grinder: null,
        brewingDevice: null,
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })
    await screen.findAllByText(/^Sealed —/)

    const columnOf = (name: string) => {
      const rows = [...document.querySelectorAll('tbody tr')]
      for (const row of rows) {
        const cells = [...row.querySelectorAll('td')]
        const index = cells.findIndex((cell) => cell.textContent === name)
        if (index >= 0) return index
      }
      throw new Error(`No cell holding "${name}"`)
    }

    expect(columnOf('Kenya Nyeri')).toBe(columnOf('Ethiopia Guji'))
  })
})
