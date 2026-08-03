import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Coffee } from './index'
import type * as ReactRouter from '@tanstack/react-router'
import { createTestProviders } from '@/test/providers'
import { makeCoffee } from '@/test/factories'

// Link needs router context; swap it for a plain anchor for unit rendering.
// Resolve `params` into `to` (e.g. /coffees/$coffeeId/edit -> /coffees/cf1/edit)
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

// coffee.getAll returns rich DB rows, but the route reads them through a narrow
// `{ name }`-only shape (it casts `coffees as Array<CoffeeRow>`). Seed the cache
// with that same narrow shape layered onto a valid makeCoffee base; the single
// cast is contained here.
type CoffeeGetAllRow = ReturnType<typeof makeCoffee>
function makeCoffeeRow(over: {
  id: string
  name: string
  notes?: string | null
  roaster?: string | null
  country?: string | null
  region?: string | null
  process?: string | null
  roastLevel?: string | null
  varieties?: Array<string>
  dialedInShot?: {
    sealed: boolean
    dose: string | null
    yield: string | null
    time: number | null
    grindSetting: string | null
  } | null
}): CoffeeGetAllRow {
  return {
    ...makeCoffee({ id: over.id, name: over.name, notes: over.notes ?? null }),
    roaster: over.roaster ? { name: over.roaster } : null,
    country: over.country ? { name: over.country } : null,
    region: over.region ? { name: over.region } : null,
    process: over.process ? { name: over.process } : null,
    roastLevel: over.roastLevel ? { name: over.roastLevel } : null,
    varieties: (over.varieties ?? []).map((name) => ({ name })),
    dialedInShot: over.dialedInShot ?? null,
  } as CoffeeGetAllRow
}

// The detail region for a row: its sibling sub-row's animating grid-rows wrap
// (grid-rows-[1fr] open, grid-rows-[0fr] collapsed). Always in the DOM.
const detailRegionFor = (name: string): HTMLElement => {
  const dataRow = within(screen.getByRole('table')).getByText(name).closest('tr')!
  return dataRow.nextElementSibling!.querySelector(
    '[class*="grid-rows-"]',
  ) as HTMLElement
}

describe('Coffees page', () => {
  it('shows the empty state when there are no coffees', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.coffee.getAll.queryKey(), [])

    render(<Coffee />, { wrapper: Wrapper })

    expect(screen.getByText(/No Coffees Yet/i)).toBeTruthy()
  })

  it('renders the identity summary columns', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.coffee.getAll.queryKey(), [
      makeCoffeeRow({
        id: 'cf1',
        name: 'Ethiopia Guji',
        roaster: 'Onyx',
        country: 'Ethiopia',
        region: 'Guji',
      }),
    ])

    render(<Coffee />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('Ethiopia Guji')).toBeTruthy()
    expect(table.getByText('Onyx')).toBeTruthy()
    expect(table.getByText('Ethiopia')).toBeTruthy()
    expect(table.getByText('Guji')).toBeTruthy()
  })

  it('expands a desktop row on click to reveal the coffee detail', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.coffee.getAll.queryKey(), [
      makeCoffeeRow({
        id: 'cf1',
        name: 'Ethiopia Guji',
        process: 'Washed',
        roastLevel: 'Light',
        varieties: ['Heirloom'],
        notes: 'jammy and bright',
      }),
    ])

    render(<Coffee />, { wrapper: Wrapper })

    const row = within(screen.getByRole('table'))
      .getByText('Ethiopia Guji')
      .closest('tr')!
    const region = detailRegionFor('Ethiopia Guji')
    expect(region.className).toContain('grid-rows-[0fr]')

    fireEvent.click(row)

    expect(region.className).toContain('grid-rows-[1fr]')
    const detail = within(region)
    expect(detail.getByText('Process')).toBeTruthy()
    expect(detail.getByText('Washed')).toBeTruthy()
    expect(detail.getByText('Roast level')).toBeTruthy()
    expect(detail.getByText('Light')).toBeTruthy()
    expect(detail.getByText('Varieties')).toBeTruthy()
    expect(detail.getByText('Heirloom')).toBeTruthy()
    expect(detail.getByText('Dialed-in espresso')).toBeTruthy()
    expect(detail.getByText('jammy and bright')).toBeTruthy()

    fireEvent.click(row)
    expect(region.className).toContain('grid-rows-[0fr]')
  })

  // A coffee whose dial-in is Sealed must not read as one that was never
  // dialed in — a dash would say the settings do not exist rather than that
  // they are not readable.
  describe('a dialed-in shot that is Sealed', () => {
    const expandDetail = (name: string) => {
      fireEvent.click(
        within(screen.getByRole('table')).getByText(name).closest('tr')!,
      )
      return within(detailRegionFor(name))
    }

    it('stands the Sealed notice in place of the recipe', () => {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      queryClient.setQueryData(trpc.coffee.getAll.queryKey(), [
        makeCoffeeRow({
          id: 'cf1',
          name: 'Colombia Huila',
          // What the server sends for a Sealed Brew: identifiable, blank.
          dialedInShot: {
            sealed: true,
            dose: null,
            yield: null,
            time: null,
            grindSetting: null,
          },
        }),
      ])
      render(<Coffee />, { wrapper: Wrapper })

      const detail = expandDetail('Colombia Huila')
      expect(detail.getByRole('note').textContent).toContain('Sealed')
      expect(detail.getByText('See plans')).toBeTruthy()
    })

    it('still shows the recipe when the shot is readable', () => {
      const { queryClient, trpc, Wrapper } = createTestProviders()
      queryClient.setQueryData(trpc.coffee.getAll.queryKey(), [
        makeCoffeeRow({
          id: 'cf1',
          name: 'Ethiopia Guji',
          dialedInShot: {
            sealed: false,
            dose: '18',
            yield: '38',
            time: 27,
            grindSetting: '5',
          },
        }),
      ])
      render(<Coffee />, { wrapper: Wrapper })

      const detail = expandDetail('Ethiopia Guji')
      expect(detail.getByText('18g → 38g · 27s · Grind 5')).toBeTruthy()
      expect(detail.queryByRole('note')).toBeNull()
    })
  })

  it('keeps only one desktop row expanded at a time (accordion)', () => {
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.coffee.getAll.queryKey(), [
      makeCoffeeRow({ id: 'cf1', name: 'Ethiopia Guji' }),
      makeCoffeeRow({ id: 'cf2', name: 'Colombia Huila' }),
    ])

    render(<Coffee />, { wrapper: Wrapper })

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
    const { queryClient, trpc, Wrapper } = createTestProviders()
    queryClient.setQueryData(trpc.coffee.getAll.queryKey(), [
      makeCoffeeRow({ id: 'cf1', name: 'Ethiopia Guji' }),
    ])

    render(<Coffee />, { wrapper: Wrapper })

    const table = within(screen.getByRole('table'))
    const region = detailRegionFor('Ethiopia Guji')

    // Edit link and Delete trigger sit in the cardHideLabel control cell, whose
    // clicks are stopped from bubbling to the row toggle. Each still does its own
    // job — the point is that doing it doesn't also expand the row.
    const editButton = table.getByRole('button', { name: 'Edit coffee' })
    expect(editButton.closest('a')?.getAttribute('href')).toBe(
      '/coffees/cf1/edit',
    )
    fireEvent.click(editButton)
    expect(region.className).toContain('grid-rows-[0fr]')

    // Delete opens its confirmation dialog (fires) and still doesn't expand.
    fireEvent.click(table.getByRole('button', { name: 'Delete coffee' }))
    expect(within(screen.getByRole('dialog')).getByText(/Ethiopia Guji/)).toBeTruthy()
    expect(region.className).toContain('grid-rows-[0fr]')
  })
})
