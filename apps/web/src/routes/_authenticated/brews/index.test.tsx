import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Route } from './index'
import type * as ReactRouter from '@tanstack/react-router'
import { createTestProviders } from '@/test/providers'
import { makeAeropressBrew, makeRecentShot } from '@/test/factories'

// Link needs router context; swap it for a plain anchor for unit rendering.
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

// Render the route's own component in place (no abstraction). Each section is
// distinguished by its action button: "Log Shot" (espresso) vs "Log Brew".
const BrewsIndex = Route.options.component!

function seeded() {
  const providers = createTestProviders()
  providers.queryClient.setQueryData(
    providers.trpc.espressoShot.getAll.queryKey(),
    [makeRecentShot()],
  )
  providers.queryClient.setQueryData(
    providers.trpc.aeropressBrew.getAll.queryKey(),
    [makeAeropressBrew()],
  )
  return providers
}

describe('BrewsIndex brew-method tabs', () => {
  it('shows both method tabs and the Espresso log by default', () => {
    const { Wrapper } = seeded()
    render(<BrewsIndex />, { wrapper: Wrapper })

    expect(screen.getByRole('tab', { name: 'Espresso' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'AeroPress' })).toBeTruthy()

    expect(screen.getByText('Log Shot')).toBeTruthy()
    expect(screen.queryByText('Log Brew')).toBeNull()
  })

  it('switches to the AeroPress log and back when tabs are clicked', () => {
    const { Wrapper } = seeded()
    render(<BrewsIndex />, { wrapper: Wrapper })

    fireEvent.click(screen.getByRole('tab', { name: 'AeroPress' }))
    expect(screen.getByText('Log Brew')).toBeTruthy()
    expect(screen.queryByText('Log Shot')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Espresso' }))
    expect(screen.getByText('Log Shot')).toBeTruthy()
    expect(screen.queryByText('Log Brew')).toBeNull()
  })
})
