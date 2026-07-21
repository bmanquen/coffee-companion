import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PouroverBrewsSection } from './pourover-brews-section'
import type * as ReactRouter from '@tanstack/react-router'
import { createTestProviders } from '@/test/providers'
import { makePouroverBrew, makeRecentCoffee } from '@/test/factories'

// Link needs router context; swap it for a plain anchor for unit rendering.
// Resolve `params` into `to` (e.g. /pourover/$brewId/edit -> /pourover/p1/edit)
// so tests can assert the real navigation target.
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

describe('PouroverBrewsSection', () => {
  it('shows the empty state when there are no brews', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.pouroverBrew.getAll.queryKey(), [])

    render(<PouroverBrewsSection />, { wrapper: Wrapper })

    expect(screen.getByText(/No pour over brews yet/i)).toBeTruthy()
  })

  it('renders each brew with its method and water', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.pouroverBrew.getAll.queryKey(), [
      makePouroverBrew({
        id: 'p1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        coffeeId: 'c1',
        water: '300',
      }),
    ])

    render(<PouroverBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('Ethiopia Guji')).toBeTruthy()
    expect(table.getByText('Standard')).toBeTruthy()
    expect(table.getByText('300g')).toBeTruthy()
  })

  it('renders the recipe columns, water temp, and the derived ratio', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.pouroverBrew.getAll.queryKey(), [
      makePouroverBrew({
        id: 'p1',
        dose: '18',
        water: '300',
        brewTime: 165,
        waterTemp: 94,
        grindSetting: '22',
      }),
    ])

    render(<PouroverBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('18g')).toBeTruthy() // dose
    expect(table.getByText('300g')).toBeTruthy() // water
    expect(table.getByText('165s')).toBeTruthy() // brew time
    expect(table.getByText('94°C')).toBeTruthy() // water temp
    expect(table.getByText('22')).toBeTruthy() // grind setting
    // Ratio is water / dose = 300 / 18 ≈ 16.7, derived in the app.
    expect(table.getByText('1:16.7')).toBeTruthy()
  })

  it('sorts by dose numerically (not lexicographically) on header click', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    // Seeded 15 before 9 so the default order is not already ascending; the
    // null-dose row exercises the sortingFn's `?? 0` fallback.
    queryClient.setQueryData(trpc.pouroverBrew.getAll.queryKey(), [
      makePouroverBrew({
        id: 'p1',
        dose: '15',
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makePouroverBrew({
        id: 'p2',
        dose: '9',
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
      makePouroverBrew({
        id: 'p3',
        dose: null,
        coffeeId: 'c3',
        coffee: makeRecentCoffee({ id: 'c3', name: 'Kenya Nyeri' }),
      }),
    ])

    render(<PouroverBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    fireEvent.click(table.getByText('Dose'))

    // Ascending numeric puts 9 before 15; a lexicographic sort would reverse it.
    // (This also guards that sorting works at all under `'use no memo'`.)
    const nine = table.getByText('9g')
    const fifteen = table.getByText('15g')
    expect(
      nine.compareDocumentPosition(fifteen) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('sorts the other custom-sorted columns without error', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.pouroverBrew.getAll.queryKey(), [
      makePouroverBrew({
        id: 'p1',
        dose: '18',
        water: '340',
        roastDate: '2026-05-01',
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      // Null water/roast-date exercises the sortingFns' `?? 0` / `?? -1` paths.
      makePouroverBrew({
        id: 'p2',
        dose: null,
        water: null,
        roastDate: null,
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<PouroverBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    // Each click runs that column's custom sortingFn (days-off-roast / water).
    for (const header of ['Days off roast', 'Water']) {
      fireEvent.click(table.getByText(header))
    }
    expect(table.getByText('Ethiopia Guji')).toBeTruthy()
    expect(table.getByText('Colombia Huila')).toBeTruthy()
  })

  it('falls back to a dash for missing recipe values', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.pouroverBrew.getAll.queryKey(), [
      makePouroverBrew({
        id: 'p1',
        dose: null,
        water: null,
        brewTime: null,
        waterTemp: null,
        grindSetting: null,
        notes: null,
      }),
    ])

    render(<PouroverBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    // Empty dose/water/brew/temp/grind/ratio render as "-"; empty notes show
    // the "No notes..." placeholder instead.
    expect(table.getAllByText('-').length).toBeGreaterThanOrEqual(6)
    expect(table.getByText('No notes...')).toBeTruthy()
  })

  it('highlights the dialed-in row and not the others', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.pouroverBrew.getAll.queryKey(), [
      makePouroverBrew({
        id: 'p1',
        isDialedIn: true,
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makePouroverBrew({
        id: 'p2',
        isDialedIn: false,
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<PouroverBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    const dialedRow = table.getByText('Ethiopia Guji').closest('tr')!
    const otherRow = table.getByText('Colombia Huila').closest('tr')!
    expect(dialedRow.className).toContain('bg-primary')
    expect(otherRow.className).not.toContain('bg-primary')
  })

  it('links each row to its edit page and the header to the new-brew form', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.pouroverBrew.getAll.queryKey(), [
      makePouroverBrew({ id: 'p1' }),
    ])

    render(<PouroverBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    // The edit control is an icon button wrapped in a Link; walk to the anchor.
    const editAnchor = table
      .getByRole('button', { name: 'Edit brew' })
      .closest('a')
    expect(editAnchor?.getAttribute('href')).toBe('/pourover/p1/edit')
    // Header action links to the log form.
    const logAnchor = screen
      .getByRole('button', { name: 'Log Brew' })
      .closest('a')
    expect(logAnchor?.getAttribute('href')).toBe('/pourover/new')
  })

  it('filters brews by the free-text filter', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.pouroverBrew.getAll.queryKey(), [
      makePouroverBrew({
        id: 'p1',
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makePouroverBrew({
        id: 'p2',
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<PouroverBrewsSection />, { wrapper: Wrapper })

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
    queryClient.setQueryData(trpc.pouroverBrew.getAll.queryKey(), [
      makePouroverBrew({
        id: 'p1',
        isDialedIn: true,
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makePouroverBrew({
        id: 'p2',
        isDialedIn: false,
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<PouroverBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    // Labels are scoped per method so the toggle reads clearly for each row.
    const dialed = table.getByRole('button', {
      name: 'Dialed in Ethiopia Guji for Standard — clear',
    })
    expect(dialed.getAttribute('aria-pressed')).toBe('true')
    const notDialed = table.getByRole('button', {
      name: 'Mark Colombia Huila as dialed in for Standard',
    })
    expect(notDialed.getAttribute('aria-pressed')).toBe('false')
  })

  it('opens a delete confirmation dialog naming the coffee', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.pouroverBrew.getAll.queryKey(), [
      makePouroverBrew({
        id: 'p1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
    ])

    render(<PouroverBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    fireEvent.click(table.getByRole('button', { name: 'Delete brew' }))

    const dialog = within(screen.getByRole('dialog'))
    expect(
      dialog.getByText(/Are you sure you want to delete this brew/i),
    ).toBeTruthy()
    expect(dialog.getByText(/Ethiopia Guji/)).toBeTruthy()
    expect(dialog.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('fires setDialedIn with the coffee, method, and brew when toggled on', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      queryClient.setQueryData(trpc.pouroverBrew.getAll.queryKey(), [
        makePouroverBrew({
          id: 'p1',
          isDialedIn: false,
          coffeeId: 'c1',
          methodId: 'm1',
          coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        }),
      ])

      render(<PouroverBrewsSection />, { wrapper: Wrapper })
      const table = within(screen.getByRole('table'))
      fireEvent.click(
        table.getByRole('button', {
          name: 'Mark Ethiopia Guji as dialed in for Standard',
        }),
      )

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('pouroverBrew.setDialedIn')
      const body = String(init?.body ?? '')
      expect(body).toContain('p1')
      expect(body).toContain('c1')
      expect(body).toContain('m1')
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('clears the dialed-in brew (null brewId) when toggled off', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      queryClient.setQueryData(trpc.pouroverBrew.getAll.queryKey(), [
        makePouroverBrew({
          id: 'p1',
          isDialedIn: true,
          coffeeId: 'c1',
          methodId: 'm1',
          coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        }),
      ])

      render(<PouroverBrewsSection />, { wrapper: Wrapper })
      const table = within(screen.getByRole('table'))
      fireEvent.click(
        table.getByRole('button', {
          name: 'Dialed in Ethiopia Guji for Standard — clear',
        }),
      )

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('pouroverBrew.setDialedIn')
      const body = String(init?.body ?? '')
      // Clearing scopes to coffee + method but sends no brew id.
      expect(body).toContain('c1')
      expect(body).toContain('m1')
      expect(body).not.toContain('p1')
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('deletes the brew when the confirmation dialog is confirmed', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      queryClient.setQueryData(trpc.pouroverBrew.getAll.queryKey(), [
        makePouroverBrew({ id: 'p1' }),
      ])

      render(<PouroverBrewsSection />, { wrapper: Wrapper })
      const table = within(screen.getByRole('table'))
      fireEvent.click(table.getByRole('button', { name: 'Delete brew' }))
      const dialog = within(screen.getByRole('dialog'))
      fireEvent.click(dialog.getByRole('button', { name: 'Delete' }))

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('pouroverBrew.delete')
      expect(String(init?.body ?? '')).toContain('p1')
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
