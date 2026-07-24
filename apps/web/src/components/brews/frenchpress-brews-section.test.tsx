import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FrenchpressBrewsSection } from './frenchpress-brews-section'
import type * as ReactRouter from '@tanstack/react-router'
import { createTestProviders } from '@/test/providers'
import { makeFrenchpressBrew, makeRecentCoffee } from '@/test/factories'

// Link needs router context; swap it for a plain anchor for unit rendering.
// Resolve `params` into `to` (e.g. /frenchpress/$brewId/edit -> /frenchpress/f1/edit)
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

describe('FrenchpressBrewsSection', () => {
  it('shows the empty state when there are no brews', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [])

    render(<FrenchpressBrewsSection />, { wrapper: Wrapper })

    expect(screen.getByText(/No french press brews yet/i)).toBeTruthy()
  })

  it('renders each brew with its method and water', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [
      makeFrenchpressBrew({
        id: 'f1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        coffeeId: 'c1',
        water: '500',
      }),
    ])

    render(<FrenchpressBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('Ethiopia Guji')).toBeTruthy()
    expect(table.getByText('Standard')).toBeTruthy()
    expect(table.getByText('500g')).toBeTruthy()
  })

  it('renders the recipe columns, steep time, and water temp', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [
      makeFrenchpressBrew({
        id: 'f1',
        dose: '30',
        water: '500',
        steepTime: 240,
        waterTemp: 95,
        grindSetting: '30',
      }),
    ])

    render(<FrenchpressBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('30g')).toBeTruthy() // dose
    expect(table.getByText('500g')).toBeTruthy() // water
    expect(table.getByText('240s')).toBeTruthy() // steep time
    expect(table.getByText('30')).toBeTruthy() // grind setting
    // Water temp is no longer a summary column — it lives in the expander
    // (BrewDetails `extra`), still present in the always-rendered sub-row.
    expect(table.getByText('95°C')).toBeTruthy() // water temp
  })

  it('sorts by dose numerically (not lexicographically) on header click', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    // Seeded 15 before 9 so the default order is not already ascending; the
    // null-dose row exercises the sortingFn's `?? 0` fallback.
    queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [
      makeFrenchpressBrew({
        id: 'f1',
        dose: '15',
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makeFrenchpressBrew({
        id: 'f2',
        dose: '9',
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
      makeFrenchpressBrew({
        id: 'f3',
        dose: null,
        coffeeId: 'c3',
        coffee: makeRecentCoffee({ id: 'c3', name: 'Kenya Nyeri' }),
      }),
    ])

    render(<FrenchpressBrewsSection />, { wrapper: Wrapper })

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
    queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [
      makeFrenchpressBrew({
        id: 'f1',
        dose: '30',
        water: '520',
        roastDate: '2026-05-01',
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      // Null water/roast-date exercises the sortingFns' `?? 0` / `?? -1` paths.
      makeFrenchpressBrew({
        id: 'f2',
        dose: null,
        water: null,
        roastDate: null,
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<FrenchpressBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    // Water keeps its custom sortingFn. (Days-off-roast is no longer a sortable
    // column — it lives in the expander now; see ADR-0003.)
    fireEvent.click(table.getByText('Water'))
    expect(table.getByText('Ethiopia Guji')).toBeTruthy()
    expect(table.getByText('Colombia Huila')).toBeTruthy()
  })

  it('falls back to a dash for missing recipe values', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [
      makeFrenchpressBrew({
        id: 'f1',
        dose: null,
        water: null,
        steepTime: null,
        waterTemp: null,
        grindSetting: null,
        notes: null,
      }),
    ])

    render(<FrenchpressBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    // Empty grind/dose/water/steep summary columns render as "-"; empty notes
    // show the "No notes..." placeholder in the expander (BrewDetails).
    expect(table.getAllByText('-').length).toBeGreaterThanOrEqual(4)
    expect(table.getByText('No notes...')).toBeTruthy()
  })

  it('highlights the dialed-in row and not the others', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [
      makeFrenchpressBrew({
        id: 'f1',
        isDialedIn: true,
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makeFrenchpressBrew({
        id: 'f2',
        isDialedIn: false,
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<FrenchpressBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    const dialedRow = table.getByText('Ethiopia Guji').closest('tr')!
    const otherRow = table.getByText('Colombia Huila').closest('tr')!
    expect(dialedRow.className).toContain('bg-primary')
    expect(otherRow.className).not.toContain('bg-primary')
  })

  it('links each row to its edit page and the header to the new-brew form', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [
      makeFrenchpressBrew({ id: 'f1' }),
    ])

    render(<FrenchpressBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    // The edit control is an icon button wrapped in a Link; walk to the anchor.
    const editAnchor = table
      .getByRole('button', { name: 'Edit brew' })
      .closest('a')
    expect(editAnchor?.getAttribute('href')).toBe('/frenchpress/f1/edit')
    // Header action links to the log form.
    const logAnchor = screen
      .getByRole('button', { name: 'Log Brew' })
      .closest('a')
    expect(logAnchor?.getAttribute('href')).toBe('/frenchpress/new')
  })

  it('filters brews by the free-text filter', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [
      makeFrenchpressBrew({
        id: 'f1',
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makeFrenchpressBrew({
        id: 'f2',
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<FrenchpressBrewsSection />, { wrapper: Wrapper })

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
    queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [
      makeFrenchpressBrew({
        id: 'f1',
        isDialedIn: true,
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makeFrenchpressBrew({
        id: 'f2',
        isDialedIn: false,
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<FrenchpressBrewsSection />, { wrapper: Wrapper })

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
    queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [
      makeFrenchpressBrew({
        id: 'f1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
    ])

    render(<FrenchpressBrewsSection />, { wrapper: Wrapper })

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
      queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [
        makeFrenchpressBrew({
          id: 'f1',
          isDialedIn: false,
          coffeeId: 'c1',
          methodId: 'm1',
          coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        }),
      ])

      render(<FrenchpressBrewsSection />, { wrapper: Wrapper })
      const table = within(screen.getByRole('table'))
      fireEvent.click(
        table.getByRole('button', {
          name: 'Mark Ethiopia Guji as dialed in for Standard',
        }),
      )

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('frenchpressBrew.setDialedIn')
      const body = String(init?.body ?? '')
      expect(body).toContain('f1')
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
      queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [
        makeFrenchpressBrew({
          id: 'f1',
          isDialedIn: true,
          coffeeId: 'c1',
          methodId: 'm1',
          coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        }),
      ])

      render(<FrenchpressBrewsSection />, { wrapper: Wrapper })
      const table = within(screen.getByRole('table'))
      fireEvent.click(
        table.getByRole('button', {
          name: 'Dialed in Ethiopia Guji for Standard — clear',
        }),
      )

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('frenchpressBrew.setDialedIn')
      const body = String(init?.body ?? '')
      // Clearing scopes to coffee + method but sends no brew id.
      expect(body).toContain('c1')
      expect(body).toContain('m1')
      expect(body).not.toContain('f1')
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
      queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [
        makeFrenchpressBrew({ id: 'f1' }),
      ])

      render(<FrenchpressBrewsSection />, { wrapper: Wrapper })
      const table = within(screen.getByRole('table'))
      fireEvent.click(table.getByRole('button', { name: 'Delete brew' }))
      const dialog = within(screen.getByRole('dialog'))
      fireEvent.click(dialog.getByRole('button', { name: 'Delete' }))

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('frenchpressBrew.delete')
      expect(String(init?.body ?? '')).toContain('f1')
    } finally {
      fetchSpy.mockRestore()
    }
  })

  // The detail region for a row: its sibling sub-row's animating grid-rows wrap
  // (grid-rows-[1fr] open, grid-rows-[0fr] collapsed). Always in the DOM.
  const detailRegionFor = (name: string): HTMLElement => {
    const dataRow = within(screen.getByRole('table')).getByText(name).closest('tr')!
    return dataRow.nextElementSibling!.querySelector(
      '[class*="grid-rows-"]',
    ) as HTMLElement
  }

  it('expands a desktop row on click to reveal the brew detail with water temp', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [
      makeFrenchpressBrew({
        id: 'f1',
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        waterTemp: 95,
        notes: 'tasted heavy',
      }),
    ])

    render(<FrenchpressBrewsSection />, { wrapper: Wrapper })

    const row = within(screen.getByRole('table'))
      .getByText('Ethiopia Guji')
      .closest('tr')!
    const region = detailRegionFor('Ethiopia Guji')
    expect(region.className).toContain('grid-rows-[0fr]')

    fireEvent.click(row)

    expect(region.className).toContain('grid-rows-[1fr]')
    const detail = within(region)
    expect(detail.getByText('Grinder')).toBeTruthy()
    expect(detail.getByText('Device')).toBeTruthy()
    expect(detail.getByText('Days off roast')).toBeTruthy()
    // French Press's method-specific expander field.
    expect(detail.getByText('Water temp')).toBeTruthy()
    expect(detail.getByText('95°C')).toBeTruthy()
    expect(detail.getByText('tasted heavy')).toBeTruthy()

    fireEvent.click(row)
    expect(region.className).toContain('grid-rows-[0fr]')
  })

  it('keeps only one desktop row expanded at a time (accordion)', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [
      makeFrenchpressBrew({
        id: 'f1',
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
      makeFrenchpressBrew({
        id: 'f2',
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Colombia Huila' }),
      }),
    ])

    render(<FrenchpressBrewsSection />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    const row1 = table.getByText('Ethiopia Guji').closest('tr')!
    const row2 = table.getByText('Colombia Huila').closest('tr')!
    const region1 = detailRegionFor('Ethiopia Guji')
    const region2 = detailRegionFor('Colombia Huila')

    fireEvent.click(row1)
    expect(region1.className).toContain('grid-rows-[1fr]')

    fireEvent.click(row2)
    expect(region2.className).toContain('grid-rows-[1fr]')
    expect(region1.className).toContain('grid-rows-[0fr]')
  })

  it('does not expand the row when a control is activated', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    try {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      queryClient.setQueryData(trpc.frenchpressBrew.getAll.queryKey(), [
        makeFrenchpressBrew({
          id: 'f1',
          isDialedIn: false,
          coffeeId: 'c1',
          coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        }),
      ])

      render(<FrenchpressBrewsSection />, { wrapper: Wrapper })

      const table = within(screen.getByRole('table'))
      const region = detailRegionFor('Ethiopia Guji')

      // Dialed-in toggle, Edit link, and Delete trigger all sit in cardHideLabel
      // control cells, whose clicks are stopped from bubbling to the row toggle.
      fireEvent.click(
        table.getByRole('button', {
          name: 'Mark Ethiopia Guji as dialed in for Standard',
        }),
      )
      expect(region.className).toContain('grid-rows-[0fr]')

      fireEvent.click(table.getByRole('button', { name: 'Edit brew' }))
      expect(region.className).toContain('grid-rows-[0fr]')

      fireEvent.click(table.getByRole('button', { name: 'Delete brew' }))
      expect(region.className).toContain('grid-rows-[0fr]')
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
