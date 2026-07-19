import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ColdBrewBrewsSection } from './cold-brew-brews-section'
import type * as ReactRouter from '@tanstack/react-router'
import { createTestProviders } from '@/test/providers'
import { makeColdBrewBrew, makeRecentCoffee } from '@/test/factories'

// Link needs router context; swap it for a plain anchor for unit rendering.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>()
  return {
    ...actual,
    Link: ({
      to,
      params,
      children,
      ...props
    }: {
      to: string
      params?: Record<string, string>
      children: React.ReactNode
    }) => {
      const href = params
        ? Object.entries(params).reduce(
            (acc, [key, value]) => acc.replace(`$${key}`, value),
            to,
          )
        : to
      return (
        <a href={href} {...props}>
          {children}
        </a>
      )
    },
  }
})

describe('ColdBrewBrewsSection', () => {
  it('shows the empty state when there are no brews', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.coldBrewBrew.getAll.queryKey(), [])

    render(<ColdBrewBrewsSection />, { wrapper: Wrapper })

    expect(screen.getByText(/No cold brews yet/i)).toBeTruthy()
  })

  it('renders each brew with its recipe, steep time, environment, and derived ratio', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.coldBrewBrew.getAll.queryKey(), [
      makeColdBrewBrew({
        id: 'cb1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        coffeeId: 'c1',
        dose: '50',
        water: '500',
        steepTime: 1080,
        brewEnvironment: 'Fridge',
        grindSetting: 'coarse',
      }),
    ])

    render(<ColdBrewBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('Ethiopia Guji')).toBeTruthy()
    expect(table.getByText('50g')).toBeTruthy() // dose
    expect(table.getByText('500g')).toBeTruthy() // water
    // 1080 minutes -> 18 hours, formatted as "18h".
    expect(table.getByText('18h')).toBeTruthy()
    expect(table.getByText('Fridge')).toBeTruthy() // brew environment
    expect(table.getByText('coarse')).toBeTruthy() // grind setting
    // Ratio is water / dose = 500 / 50 = 10.0, derived in the app.
    expect(table.getByText('1:10.0')).toBeTruthy()
  })

  it('formats a sub-hour steep with minutes', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.coldBrewBrew.getAll.queryKey(), [
      makeColdBrewBrew({ id: 'cb1', steepTime: 90 }),
    ])

    render(<ColdBrewBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('1h 30m')).toBeTruthy()
  })

  it('falls back to a dash for missing recipe values', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.coldBrewBrew.getAll.queryKey(), [
      makeColdBrewBrew({
        id: 'cb1',
        dose: null,
        water: null,
        steepTime: null,
        brewEnvironment: null,
        grindSetting: null,
        notes: null,
      }),
    ])

    render(<ColdBrewBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    // Empty dose/water/steep/environment/grind/notes/ratio all render as "-".
    expect(table.getAllByText('-').length).toBeGreaterThanOrEqual(6)
  })

  it('links the header to the new cold brew form', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.coldBrewBrew.getAll.queryKey(), [
      makeColdBrewBrew({ id: 'cb1' }),
    ])

    render(<ColdBrewBrewsSection />, { wrapper: Wrapper })

    const logAnchor = screen
      .getByRole('button', { name: 'Log Brew' })
      .closest('a')
    expect(logAnchor?.getAttribute('href')).toBe('/cold-brew/new')
  })

  it('filters brews by the free-text filter', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.coldBrewBrew.getAll.queryKey(), [
      makeColdBrewBrew({
        id: 'cb1',
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makeColdBrewBrew({
        id: 'cb2',
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<ColdBrewBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('Ethiopia Guji')).toBeTruthy()
    expect(table.getByText('Colombia Huila')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('Filter brews...'), {
      target: { value: 'Huila' },
    })

    expect(table.queryByText('Ethiopia Guji')).toBeNull()
    expect(table.getByText('Colombia Huila')).toBeTruthy()
  })
})
