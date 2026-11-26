import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeRecentCoffee, makeRecentShot } from '@/test/factories'
import { BrewFeed } from './brew-feed'
import type * as ReactRouter from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import type { AppFeatures } from '@/components/data-table'

vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandInput: ({ placeholder }: { placeholder?: string }) => (
    <input placeholder={placeholder} />
  ),
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode
    onSelect?: () => void
  }) => (
    <div role="option" onClick={() => onSelect?.()}>
      {children}
    </div>
  ),
}))

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

const BREW_FEED_PAGE_SIZE = 5
const SHOTS_PER_COFFEE = 6

const columns: Array<ColumnDef<AppFeatures, ReturnType<typeof makeRecentShot>, unknown>> = [
  {
    accessorFn: (row) => row.coffee.name,
    id: 'coffee',
    header: 'Coffee',
    cell: (info) => info.getValue(),
  },
]

function renderFeed(
  props: Partial<Parameters<typeof BrewFeed<ReturnType<typeof makeRecentShot>>>[0]> = {},
) {
  const guji = makeRecentShot({
    id: 's1',
    isDialedIn: false,
    coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
  })
  const kenya = makeRecentShot({
    id: 's2',
    coffeeId: 'c2',
    isDialedIn: true,
    coffee: makeRecentCoffee({ id: 'c2', name: 'Kenya AA' }),
  })
  return render(
    <BrewFeed
      title="Espresso"
      brews={[guji, kenya]}
      columns={columns}
      renderDetails={() => null}
      newTo="/espresso/new"
      logLabel="Log Shot"
      emptyMessage="No espresso shots yet."
      emptyLinkLabel="Log your first shot"
      {...props}
    />,
  )
}

describe('BrewFeed', () => {
  it('still filters Dialed-in only when only the coffee filter is controlled', () => {
    renderFeed({
      coffeeFilter: { value: '', onChange: vi.fn() },
    })

    const table = within(screen.getByRole('table'))
    expect(table.getByText('Ethiopia Guji')).toBeTruthy()
    expect(table.getByText('Kenya AA')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Dialed-in only' }))

    expect(table.queryByText('Ethiopia Guji')).toBeNull()
    expect(table.getByText('Kenya AA')).toBeTruthy()
  })

  it('still filters by coffee when only Dialed-in only is controlled', () => {
    renderFeed({
      dialedInFilter: { value: false, onChange: vi.fn() },
    })

    fireEvent.click(screen.getByText('All coffees'))
    fireEvent.click(screen.getByRole('option', { name: 'Kenya AA' }))

    const table = within(screen.getByRole('table'))
    expect(table.queryByText('Ethiopia Guji')).toBeNull()
    expect(table.getByText('Kenya AA')).toBeTruthy()
  })

  it('still shows the coffee-load banner in the empty state', () => {
    renderFeed({
      brews: [],
      banner: <p role="alert">We couldn&apos;t load your coffees. Try again.</p>,
    })
    expect(screen.getByText(/No espresso shots yet/i)).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe(
      "We couldn't load your coffees. Try again.",
    )
  })

  it('resets to page 1 when a filter still spans multiple pages', () => {
    const ethiopia = Array.from({ length: SHOTS_PER_COFFEE }, (_, index) =>
      makeRecentShot({
        id: `e${index}`,
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
    )
    const kenya = Array.from({ length: SHOTS_PER_COFFEE }, (_, index) =>
      makeRecentShot({
        id: `k${index}`,
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Kenya AA' }),
      }),
    )
    renderFeed({
      brews: [...ethiopia, ...kenya],
      pageSize: BREW_FEED_PAGE_SIZE,
    })

    expect(screen.getByText('Page 1 of 3')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('Page 2 of 3')).toBeTruthy()

    fireEvent.click(screen.getByText('All coffees'))
    fireEvent.click(screen.getByRole('option', { name: 'Ethiopia Guji' }))

    expect(screen.getByText('Page 1 of 2')).toBeTruthy()
  })

  it('stays on page 1 when a Next load started before a filter change lands', async () => {
    const ethiopia = Array.from({ length: SHOTS_PER_COFFEE }, (_, index) =>
      makeRecentShot({
        id: `e${index}`,
        coffeeId: 'c1',
        coffee: makeRecentCoffee({ id: 'c1', name: 'Ethiopia Guji' }),
      }),
    )
    const kenya = Array.from({ length: SHOTS_PER_COFFEE }, (_, index) =>
      makeRecentShot({
        id: `k${index}`,
        coffeeId: 'c2',
        coffee: makeRecentCoffee({ id: 'c2', name: 'Kenya AA' }),
      }),
    )
    let settleLoad: (firstId: string | null) => void = () => {}
    const loadMore = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          settleLoad = resolve
        }),
    )
    renderFeed({
      brews: [...ethiopia, ...kenya],
      pageSize: BREW_FEED_PAGE_SIZE,
      hasMore: true,
      loadMore,
    })
    fireEvent.click(screen.getByLabelText('Next page'))
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText(/^Page 3 of 3/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(loadMore).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('All coffees'))
    fireEvent.click(screen.getByRole('option', { name: 'Ethiopia Guji' }))
    // e5 is on page 2 of the filtered rows, so only the generation check
    // keeps the old load from moving there.
    await act(async () => {
      settleLoad('e5')
    })
    expect(screen.getByText(/^Page 1 of 2/)).toBeTruthy()
  })

  it('stays on page 1 when a Next load settles just before a filter change', async () => {
    const shot = (id: string, coffeeId: string, name: string) =>
      makeRecentShot({
        id,
        coffeeId,
        coffee: makeRecentCoffee({ id: coffeeId, name }),
      })
    const ethiopia = Array.from({ length: SHOTS_PER_COFFEE }, (_, index) =>
      shot(`e${index}`, 'c1', 'Ethiopia Guji'),
    )
    const kenya = Array.from({ length: SHOTS_PER_COFFEE }, (_, index) =>
      shot(`k${index}`, 'c2', 'Kenya AA'),
    )
    let settleLoad: (firstId: string | null) => void = () => {}
    const loadMore = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          settleLoad = resolve
        }),
    )
    const feed = (brews: Array<ReturnType<typeof makeRecentShot>>) => (
      <BrewFeed
        title="Espresso"
        brews={brews}
        columns={columns}
        renderDetails={() => null}
        newTo="/espresso/new"
        logLabel="Log Shot"
        emptyMessage="No espresso shots yet."
        emptyLinkLabel="Log your first shot"
        pageSize={BREW_FEED_PAGE_SIZE}
        hasMore
        loadMore={loadMore}
      />
    )
    const { rerender } = render(feed([...ethiopia, ...kenya]))
    fireEvent.click(screen.getByLabelText('Next page'))
    fireEvent.click(screen.getByLabelText('Next page'))
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(loadMore).toHaveBeenCalledTimes(1)
    // The page lands before loadMore resolves, as with the real query.
    rerender(feed([...ethiopia, ...kenya, shot('e6', 'c1', 'Ethiopia Guji')]))

    fireEvent.click(screen.getByText('All coffees'))
    await act(async () => {
      settleLoad('e6')
      await new Promise((resolve) => setTimeout(resolve, 0))
      // The user picks the filter before React renders the settled load.
      fireEvent.click(screen.getByRole('option', { name: 'Ethiopia Guji' }))
    })
    expect(screen.getByText(/^Page 1 of 2/)).toBeTruthy()
  })

  it('keeps an opened brew open only for that brew when a filter moves rows', () => {
    renderFeed({
      // Details stay mounted (hidden) for closed rows, so name only open ones.
      renderDetails: (row) =>
        row.getIsExpanded() ? <p>Open: {row.original.coffee.name}</p> : null,
    })

    const table = within(screen.getByRole('table'))
    fireEvent.click(table.getByText('Ethiopia Guji'))
    expect(screen.getAllByText('Open: Ethiopia Guji')).not.toHaveLength(0)

    fireEvent.click(screen.getByText('All coffees'))
    fireEvent.click(screen.getByRole('option', { name: 'Kenya AA' }))

    expect(table.getByText('Kenya AA')).toBeTruthy()
    expect(screen.queryAllByText(/^Open:/)).toHaveLength(0)
  })

  it('does not call the history empty while another page is available', () => {
    renderFeed({ brews: [], hasMore: true })
    expect(screen.queryByText(/No espresso shots yet/i)).toBeNull()
    expect(screen.getByRole('table')).toBeTruthy()
  })
})
