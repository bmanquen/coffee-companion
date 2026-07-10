import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DataTable } from './data-table'
import type { ColumnDef, Row } from '@tanstack/react-table'

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

      // The full-width column's label/value live in a plain <dl>, not the
      // columned body used for the other fields.
      const notesLabel = card.getByText('Notes')
      const notesDl = notesLabel.closest('dl')!
      expect(notesDl.className).not.toContain('columns-2')
      expect(within(notesDl).getByText('Juicy, floral, long finish.')).toBeTruthy()

      // A normal field stays in the two-column body.
      const roasterDl = card.getByText('Roaster').closest('dl')!
      expect(roasterDl.className).toContain('columns-2')
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
})
