import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
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
  it('renders a header and a row per item', () => {
    render(
      <DataTableHarness
        data={[
          { name: 'Ethiopia Guji', roaster: 'Sey' },
          { name: 'Colombia El Paraiso', roaster: 'Onyx' },
        ]}
      />,
    )
    expect(screen.getByText('Coffee')).toBeTruthy()
    expect(screen.getByText('Roaster')).toBeTruthy()
    expect(screen.getByText('Ethiopia Guji')).toBeTruthy()
    expect(screen.getByText('Colombia El Paraiso')).toBeTruthy()
  })

  it('shows an empty state when there are no rows', () => {
    render(<DataTableHarness data={[]} />)
    expect(screen.getByText('No results.')).toBeTruthy()
  })
})
