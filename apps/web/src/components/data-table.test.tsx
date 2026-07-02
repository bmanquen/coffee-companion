import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DataTable } from './data-table'

type CoffeeRow = { name: string; roaster: string }

const columnHelper = createColumnHelper<CoffeeRow>()
const columns = [
  columnHelper.accessor('name', { header: 'Coffee' }),
  columnHelper.accessor('roaster', { header: 'Roaster' }),
]

// DataTable takes a built TanStack Table instance; this wrapper supplies one.
function DataTableHarness({ data }: { data: Array<CoffeeRow> }) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  return <DataTable table={table} />
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
})
