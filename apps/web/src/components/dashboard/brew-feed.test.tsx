import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BrewFeed } from './brew-feed'
import type * as ReactRouter from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import { makeRecentCoffee, makeRecentShot } from '@/test/factories'

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

const columns: Array<ColumnDef<ReturnType<typeof makeRecentShot>, unknown>> = [
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
})
