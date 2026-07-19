import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
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

  it('reflects each brew’s dialed-in state on the crosshair toggle', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.coldBrewBrew.getAll.queryKey(), [
      makeColdBrewBrew({
        id: 'cb1',
        isDialedIn: true,
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makeColdBrewBrew({
        id: 'cb2',
        isDialedIn: false,
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<ColdBrewBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    const dialed = table.getByRole('button', { name: 'Dialed in — clear' })
    expect(dialed.getAttribute('aria-pressed')).toBe('true')
    const notDialed = table.getByRole('button', { name: 'Mark as dialed in' })
    expect(notDialed.getAttribute('aria-pressed')).toBe('false')
  })

  it('highlights the dialed-in row and not the others', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.coldBrewBrew.getAll.queryKey(), [
      makeColdBrewBrew({
        id: 'cb1',
        isDialedIn: true,
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makeColdBrewBrew({
        id: 'cb2',
        isDialedIn: false,
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<ColdBrewBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    const dialedRow = table.getByText('Ethiopia Guji').closest('tr')!
    const otherRow = table.getByText('Colombia Huila').closest('tr')!
    expect(dialedRow.className).toContain('bg-primary')
    expect(otherRow.className).not.toContain('bg-primary')
  })

  it('fires setDialedIn with the coffee and brew (no method) when toggled on', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('[]', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      queryClient.setQueryData(trpc.coldBrewBrew.getAll.queryKey(), [
        makeColdBrewBrew({
          id: 'cb1',
          isDialedIn: false,
          coffeeId: 'c1',
          coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        }),
      ])

      render(<ColdBrewBrewsSection />, { wrapper: Wrapper })
      const table = within(screen.getByRole('table'))
      fireEvent.click(table.getByRole('button', { name: 'Mark as dialed in' }))

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('coldBrewBrew.setDialedIn')
      const body = String(init?.body ?? '')
      expect(body).toContain('cb1')
      expect(body).toContain('c1')
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('clears the dialed-in brew (null brewId) when toggled off', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('[]', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      queryClient.setQueryData(trpc.coldBrewBrew.getAll.queryKey(), [
        makeColdBrewBrew({
          id: 'cb1',
          isDialedIn: true,
          coffeeId: 'c1',
          coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        }),
      ])

      render(<ColdBrewBrewsSection />, { wrapper: Wrapper })
      const table = within(screen.getByRole('table'))
      fireEvent.click(table.getByRole('button', { name: 'Dialed in — clear' }))

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('coldBrewBrew.setDialedIn')
      const body = String(init?.body ?? '')
      // Clearing scopes to the coffee but sends no brew id.
      expect(body).toContain('c1')
      expect(body).not.toContain('cb1')
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
