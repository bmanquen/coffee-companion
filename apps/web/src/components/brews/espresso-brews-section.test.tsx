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

  it('renders the recipe columns', () => {
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
    // Empty grind/dose/yield/time summary columns render as "-"; empty notes
    // show the "No notes..." placeholder in the expander (BrewDetails).
    expect(table.getAllByText('-').length).toBeGreaterThanOrEqual(4)
    expect(table.getByText('No notes...')).toBeTruthy()
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
    const dialed = table.getByRole('button', {
      name: 'Dialed in Ethiopia Guji — clear',
    })
    expect(dialed.getAttribute('aria-pressed')).toBe('true')
    const notDialed = table.getByRole('button', {
      name: 'Mark Colombia Huila as dialed in',
    })
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
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
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
      fireEvent.click(
        table.getByRole('button', { name: 'Mark Ethiopia Guji as dialed in' }),
      )

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
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
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

  // The detail region for a row: its sibling sub-row's animating grid-rows wrap
  // (grid-rows-[1fr] open, grid-rows-[0fr] collapsed). Always in the DOM.
  const detailRegionFor = (name: string): HTMLElement => {
    const dataRow = within(screen.getByRole('table')).getByText(name).closest('tr')!
    return dataRow.nextElementSibling!.querySelector(
      '[class*="grid-rows-"]',
    ) as HTMLElement
  }

  it('expands a desktop row on click to reveal the brew detail', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.espressoShot.getAll.queryKey(), [
      makeRecentShot({
        id: 's1',
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
        notes: 'tasted bright',
      }),
    ])

    render(<EspressoBrewsSection />, { wrapper: Wrapper })

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
    expect(detail.getByText('tasted bright')).toBeTruthy()

    fireEvent.click(row)
    expect(region.className).toContain('grid-rows-[0fr]')
  })

  it('keeps only one desktop row expanded at a time (accordion)', () => {
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
      const region = detailRegionFor('Ethiopia Guji')

      // Dialed-in toggle, Edit link, and Delete trigger all sit in cardHideLabel
      // control cells, whose clicks are stopped from bubbling to the row toggle.
      fireEvent.click(
        table.getByRole('button', { name: 'Mark Ethiopia Guji as dialed in' }),
      )
      expect(region.className).toContain('grid-rows-[0fr]')

      fireEvent.click(table.getByRole('button', { name: 'Edit shot' }))
      expect(region.className).toContain('grid-rows-[0fr]')

      fireEvent.click(table.getByRole('button', { name: 'Delete shot' }))
      expect(region.className).toContain('grid-rows-[0fr]')
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
