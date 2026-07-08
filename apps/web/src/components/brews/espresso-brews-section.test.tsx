import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EspressoBrewsSection } from './espresso-brews-section'
import type * as ReactRouter from '@tanstack/react-router'
import { createTestProviders } from '@/test/providers'
import { makeRecentCoffee, makeRecentShot } from '@/test/factories'

// Link needs router context; swap it for a plain anchor for unit rendering.
// Resolve `params` into `to` (e.g. /espresso/$shotId/edit -> /espresso/s1/edit)
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

describe('EspressoBrewsSection', () => {
  it('shows the empty state when there are no shots', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), [])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    expect(screen.getByText(/No espresso shots yet/i)).toBeTruthy()
  })

  it('renders shots with dose and yield', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), [
      makeRecentShot({ id: 's1', dose: '18', yield: '36' }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('Ethiopia Guji')).toBeTruthy()
    expect(table.getByText('18g')).toBeTruthy()
    expect(table.getByText('36g')).toBeTruthy()
  })

  it('filters shots by the free-text filter', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), [
      makeRecentShot({
        id: 's1',
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makeRecentShot({
        id: 's2',
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('Ethiopia Guji')).toBeTruthy()
    expect(table.getByText('Colombia Huila')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('Filter shots...'), {
      target: { value: 'Huila' },
    })

    expect(table.queryByText('Ethiopia Guji')).toBeNull()
    expect(table.getByText('Colombia Huila')).toBeTruthy()
  })

  it('renders the recipe columns and the derived ratio', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), [
      makeRecentShot({
        id: 's1',
        dose: '18',
        yield: '36',
        time: 28,
        grindSetting: '4.5',
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('18g')).toBeTruthy() // dose
    expect(table.getByText('36g')).toBeTruthy() // yield
    expect(table.getByText('28s')).toBeTruthy() // time
    expect(table.getByText('4.5')).toBeTruthy() // grind setting
    // Ratio is yield / dose = 36 / 18 = 2.0, derived in the app.
    expect(table.getByText('1:2.0')).toBeTruthy()
  })

  it('sorts by dose numerically (not lexicographically) on header click', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    // Seeded 15 before 9 so the default order is not already ascending; the
    // null-dose row exercises the sortingFn's `?? 0` fallback.
    queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), [
      makeRecentShot({
        id: 's1',
        dose: '15',
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makeRecentShot({
        id: 's2',
        dose: '9',
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
      makeRecentShot({
        id: 's3',
        dose: null,
        coffeeId: 'c3',
        coffee: makeRecentCoffee({ id: 'c3', name: 'Kenya Nyeri' }),
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

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
    queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), [
      makeRecentShot({
        id: 's1',
        dose: '15',
        yield: '40',
        roastDate: '2026-05-01',
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      // Null yield/roast-date exercises the sortingFns' `?? 0` / `?? -1` paths.
      makeRecentShot({
        id: 's2',
        dose: null,
        yield: null,
        roastDate: null,
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    // Each click runs that column's custom sortingFn (days-off-roast / yield).
    for (const header of ['Days off roast', 'Yield']) {
      fireEvent.click(table.getByText(header))
    }
    expect(table.getByText('Ethiopia Guji')).toBeTruthy()
    expect(table.getByText('Colombia Huila')).toBeTruthy()
  })

  it('falls back to a dash for missing recipe values', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), [
      makeRecentShot({
        id: 's1',
        dose: null,
        yield: null,
        time: null,
        grindSetting: null,
        notes: null,
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    // Empty dose/yield/time/grind/notes/ratio all render as "-".
    expect(table.getAllByText('-').length).toBeGreaterThanOrEqual(5)
  })

  it('highlights the dialed-in row and not the others', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), [
      makeRecentShot({
        id: 's1',
        isDialedIn: true,
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makeRecentShot({
        id: 's2',
        isDialedIn: false,
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    const dialedRow = table.getByText('Ethiopia Guji').closest('tr')!
    const otherRow = table.getByText('Colombia Huila').closest('tr')!
    expect(dialedRow.className).toContain('bg-primary')
    expect(otherRow.className).not.toContain('bg-primary')
  })

  it('links each row to its edit page and the header to the new-shot form', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), [
      makeRecentShot({ id: 's1' }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    // The edit control is an icon button wrapped in a Link; walk to the anchor.
    const editAnchor = table
      .getByRole('button', { name: 'Edit shot' })
      .closest('a')
    expect(editAnchor?.getAttribute('href')).toBe('/espresso/s1/edit')
    // Header action links to the log form.
    const logAnchor = screen
      .getByRole('button', { name: 'Log Shot' })
      .closest('a')
    expect(logAnchor?.getAttribute('href')).toBe('/espresso/new')
  })

  it('reflects each shot’s dialed-in state on the crosshair toggle', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), [
      makeRecentShot({
        id: 's1',
        isDialedIn: true,
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makeRecentShot({
        id: 's2',
        isDialedIn: false,
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    const dialed = table.getByRole('button', { name: 'Dialed in — clear' })
    expect(dialed.getAttribute('aria-pressed')).toBe('true')
    const notDialed = table.getByRole('button', { name: 'Mark as dialed in' })
    expect(notDialed.getAttribute('aria-pressed')).toBe('false')
  })

  it('opens a delete confirmation dialog naming the coffee', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), [
      makeRecentShot({
        id: 's1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    fireEvent.click(table.getByRole('button', { name: 'Delete shot' }))

    const dialog = within(screen.getByRole('dialog'))
    expect(
      dialog.getByText(/Are you sure you want to delete this shot/i),
    ).toBeTruthy()
    expect(dialog.getByText(/Ethiopia Guji/)).toBeTruthy()
    expect(dialog.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('fires coffee.setDialedIn with the coffee and shot when toggled on', async () => {
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
      queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), [
        makeRecentShot({
          id: 's1',
          isDialedIn: false,
          coffeeId: 'c1',
          coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        }),
      ])

      render(<EspressoBrewsSection />, { wrapper: Wrapper })
      const table = within(screen.getByRole('table'))
      fireEvent.click(table.getByRole('button', { name: 'Mark as dialed in' }))

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('coffee.setDialedIn')
      const body = String(init?.body ?? '')
      expect(body).toContain('c1')
      expect(body).toContain('s1')
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('deletes the shot when the confirmation dialog is confirmed', async () => {
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
      queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), [
        makeRecentShot({ id: 's1' }),
      ])

      render(<EspressoBrewsSection />, { wrapper: Wrapper })
      const table = within(screen.getByRole('table'))
      fireEvent.click(table.getByRole('button', { name: 'Delete shot' }))
      const dialog = within(screen.getByRole('dialog'))
      fireEvent.click(dialog.getByRole('button', { name: 'Delete' }))

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('espressoShot.delete')
      expect(String(init?.body ?? '')).toContain('s1')
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
