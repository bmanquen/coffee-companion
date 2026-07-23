import {
  createColumnHelper,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DataTable } from './data-table'
import { useAccordionExpansion } from '@/hooks/use-accordion-expansion'
import type { ColumnDef, Row } from '@tanstack/react-table'
import type { ReactNode } from 'react'

type CoffeeRow = { name: string; roaster: string; notes?: string }

const columnHelper = createColumnHelper<CoffeeRow>()
const columns = [
  columnHelper.accessor('name', { header: 'Coffee' }),
  columnHelper.accessor('roaster', { header: 'Roaster' }),
]

// DataTable takes a built TanStack Table instance; this wrapper supplies one.
function DataTableHarness({
  data,
  columns: cols = columns,
  rowClassName,
}: {
  data: Array<CoffeeRow>
  columns?: Array<ColumnDef<CoffeeRow, string>>
  rowClassName?: (row: Row<CoffeeRow>) => string | undefined
}) {
  const table = useReactTable({
    data,
    columns: cols,
    getCoreRowModel: getCoreRowModel(),
  })
  return <DataTable table={table} rowClassName={rowClassName} />
}

// The mobile card layout renders below `lg` and has no ARIA role, so scope
// card assertions to the `lg:hidden` container to avoid matching the desktop
// table that jsdom also renders (no CSS applied).
function cardRegion(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>('.lg\\:hidden')!
}

describe('DataTable', () => {
  // The component renders two layouts at once — a real table (>= md) and a
  // card list (< md). jsdom applies no CSS, so both are in the DOM; scope
  // desktop assertions to the <table> to avoid duplicate matches.
  it('renders a header and a row per item', () => {
    render(
      <DataTableHarness
        data={[
          { name: 'Ethiopia Guji', roaster: 'Sey' },
          { name: 'Colombia El Paraiso', roaster: 'Onyx' },
        ]}
      />,
    )
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Coffee')).toBeTruthy()
    expect(table.getByText('Roaster')).toBeTruthy()
    expect(table.getByText('Ethiopia Guji')).toBeTruthy()
    expect(table.getByText('Colombia El Paraiso')).toBeTruthy()
  })

  it('shows an empty state when there are no rows', () => {
    render(<DataTableHarness data={[]} />)
    expect(within(screen.getByRole('table')).getByText('No results.')).toBeTruthy()
  })

  it('applies rowClassName only to rows the predicate matches', () => {
    render(
      <DataTableHarness
        data={[
          { name: 'Ethiopia Guji', roaster: 'Sey' },
          { name: 'Colombia El Paraiso', roaster: 'Onyx' },
        ]}
        rowClassName={(row) =>
          row.original.roaster === 'Sey' ? 'bg-primary/10' : undefined
        }
      />,
    )
    const table = within(screen.getByRole('table'))
    const matched = table.getByText('Ethiopia Guji').closest('tr')!
    const unmatched = table.getByText('Colombia El Paraiso').closest('tr')!
    expect(matched.className).toContain('bg-primary/10')
    expect(unmatched.className).not.toContain('bg-primary/10')
  })

  describe('card layout — cardFullWidth', () => {
    const cardColumns = [
      columnHelper.accessor('name', { header: 'Coffee', meta: { cardTitle: true } }),
      columnHelper.accessor('roaster', { header: 'Roaster' }),
      columnHelper.accessor('notes', {
        header: 'Notes',
        cell: (info) => info.getValue(),
        meta: { cardFullWidth: true },
      }),
    ] as Array<ColumnDef<CoffeeRow, string>>

    it('renders a cardFullWidth column outside the two-column body', () => {
      const { container } = render(
        <DataTableHarness
          columns={cardColumns}
          data={[
            {
              name: 'Ethiopia Guji',
              roaster: 'Sey',
              notes: 'Juicy, floral, long finish.',
            },
          ]}
        />,
      )
      const card = within(cardRegion(container))

      // The full-width column's label/value live in their own <dl>, separate
      // from the one holding the other detail fields.
      const notesLabel = card.getByText('Notes')
      const notesDl = notesLabel.closest('dl')!
      expect(within(notesDl).getByText('Juicy, floral, long finish.')).toBeTruthy()

      // A normal detail field lives in a different <dl> than the full-width one.
      const roasterDl = card.getByText('Roaster').closest('dl')!
      expect(roasterDl).not.toBe(notesDl)
    })

    it('still renders a cardFullWidth column when the body is empty', () => {
      const onlyNotes = [
        columnHelper.accessor('name', {
          header: 'Coffee',
          meta: { cardTitle: true },
        }),
        columnHelper.accessor('notes', {
          header: 'Notes',
          cell: (info) => info.getValue(),
          meta: { cardFullWidth: true },
        }),
      ] as Array<ColumnDef<CoffeeRow, string>>
      const { container } = render(
        <DataTableHarness
          columns={onlyNotes}
          data={[{ name: 'Ethiopia Guji', roaster: 'Sey', notes: 'Bright.' }]}
        />,
      )
      const card = within(cardRegion(container))
      expect(card.getByText('Notes')).toBeTruthy()
      expect(card.getByText('Bright.')).toBeTruthy()
    })
  })

  // The minimal-summary + expandable-detail behaviour (see ADR-0002). These
  // exercise the mobile card, so assertions are scoped to the card region.
  describe('card layout — summary and expandable detail', () => {
    type BrewLike = {
      name: string
      grind: string
      grinder: string
    }
    const brewHelper = createColumnHelper<BrewLike>()
    // name = title, grind = summary (labeled), grinder = detail (default).
    const brewColumns = [
      brewHelper.accessor('name', {
        header: 'Coffee',
        meta: { cardTitle: true },
      }),
      brewHelper.accessor('grind', {
        header: 'Grind',
        meta: { cardSummary: true, cardSummaryLabel: true },
      }),
      brewHelper.accessor('grinder', { header: 'Grinder' }),
    ] as Array<ColumnDef<BrewLike, string>>

    // A DataTable with accordion expansion wired (as every real caller does).
    function ExpandableHarness({
      data,
      columns: cols,
      renderSubComponent,
    }: {
      data: Array<BrewLike>
      columns: Array<ColumnDef<BrewLike, string>>
      renderSubComponent?: (row: Row<BrewLike>) => ReactNode
    }) {
      const expansion = useAccordionExpansion()
      const table = useReactTable({
        data,
        columns: cols,
        state: { expanded: expansion.expanded },
        onExpandedChange: expansion.onExpandedChange,
        getCoreRowModel: getCoreRowModel(),
        getExpandedRowModel: getExpandedRowModel(),
        getRowCanExpand: () => true,
      })
      return (
        <DataTable table={table} renderSubComponent={renderSubComponent} />
      )
    }

    // Each mobile card; the collapsible detail is the grid-rows wrapper inside.
    const cards = (container: HTMLElement) =>
      Array.from(
        cardRegion(container).querySelectorAll<HTMLElement>(':scope > div'),
      )
    const detailRegion = (card: HTMLElement) =>
      card.querySelector<HTMLElement>('[class*="grid-rows-"]')

    it('shows summary cells up front and keeps detail cells in the collapsed region', () => {
      const { container } = render(
        <ExpandableHarness
          columns={brewColumns}
          data={[{ name: 'Ethiopia Guji', grind: '12', grinder: 'Niche' }]}
        />,
      )
      const [card] = cards(container)
      const region = detailRegion(card)!

      // Grind (summary, labeled) shows outside the collapsible detail region —
      // its value "12" is in the summary, not the detail region.
      expect(within(card).getByText('Grind')).toBeTruthy()
      expect(region.textContent).not.toContain('12')
      // Grinder (default → detail) lives inside the collapsible region.
      expect(region.textContent).toContain('Grinder')
      expect(region.textContent).toContain('Niche')
      // Collapsed by default.
      expect(region.className).toContain('grid-rows-[0fr]')
    })

    it('expands a card on click and collapses it again on a second click', () => {
      const { container } = render(
        <ExpandableHarness
          columns={brewColumns}
          data={[{ name: 'Ethiopia Guji', grind: '12', grinder: 'Niche' }]}
        />,
      )
      const [card] = cards(container)
      expect(detailRegion(card)!.className).toContain('grid-rows-[0fr]')

      fireEvent.click(card)
      expect(detailRegion(card)!.className).toContain('grid-rows-[1fr]')

      fireEvent.click(card)
      expect(detailRegion(card)!.className).toContain('grid-rows-[0fr]')
    })

    it('is an accordion: opening one card collapses the previously open one', () => {
      const { container } = render(
        <ExpandableHarness
          columns={brewColumns}
          data={[
            { name: 'Ethiopia Guji', grind: '12', grinder: 'Niche' },
            { name: 'Colombia El Paraiso', grind: '8', grinder: 'Ode' },
          ]}
        />,
      )
      const [first, second] = cards(container)

      fireEvent.click(first)
      expect(detailRegion(first)!.className).toContain('grid-rows-[1fr]')

      fireEvent.click(second)
      expect(detailRegion(second)!.className).toContain('grid-rows-[1fr]')
      expect(detailRegion(first)!.className).toContain('grid-rows-[0fr]')
    })

    it('renders a flat card (no expander, not tappable) when there is no detail', () => {
      const flatColumns = [
        brewHelper.accessor('name', {
          header: 'Coffee',
          meta: { cardTitle: true },
        }),
        brewHelper.accessor('grind', {
          header: 'Grind',
          meta: { cardSummary: true, cardSummaryLabel: true },
        }),
      ] as Array<ColumnDef<BrewLike, string>>
      const { container } = render(
        <ExpandableHarness
          columns={flatColumns}
          data={[{ name: 'Ethiopia Guji', grind: '12', grinder: 'Niche' }]}
        />,
      )
      const [card] = cards(container)
      expect(detailRegion(card)).toBeNull()
      expect(card.className).not.toContain('cursor-pointer')
    })

    it('does not expand the card when an action control is activated', () => {
      const onAction = vi.fn()
      const actionColumns = [
        brewHelper.accessor('name', {
          header: 'Coffee',
          meta: { cardTitle: true },
        }),
        brewHelper.accessor('grinder', { header: 'Grinder' }),
        brewHelper.display({
          id: 'actions',
          header: '',
          cell: () => (
            <button type="button" onClick={onAction}>
              Delete
            </button>
          ),
          meta: { cardHideLabel: true },
        }),
      ] as Array<ColumnDef<BrewLike, string>>
      const { container } = render(
        <ExpandableHarness
          columns={actionColumns}
          data={[{ name: 'Ethiopia Guji', grind: '12', grinder: 'Niche' }]}
        />,
      )
      const [card] = cards(container)

      fireEvent.click(within(card).getByRole('button', { name: 'Delete' }))
      expect(onAction).toHaveBeenCalledTimes(1)
      // The card stayed collapsed — the action's click did not bubble to expand.
      expect(detailRegion(card)!.className).toContain('grid-rows-[0fr]')
    })
  })
})
