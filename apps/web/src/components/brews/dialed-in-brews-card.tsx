import {
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { ColumnDef, Row } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { DataTable } from '@/components/data-table'

// The dashboard "Dialed In {method}" card shell, shared by every method. The
// caller supplies the title, the dialed-in rows, the per-method columns, and
// how to render the expandable detail. Renders nothing when empty (keeps the
// dashboard uncluttered). Method-specific columns/details are composed in by
// each card rather than generalized here.
export function DialedInBrewsCard<T>({
  title,
  data,
  columns,
  renderDetails,
}: {
  title: string
  data: Array<T>
  // TanStack itself types its columns option with `any` for the cell value, so
  // a heterogeneous column array can be passed through a generic wrapper.
  columns: Array<ColumnDef<T, any>>
  renderDetails: (row: Row<T>) => ReactNode
}) {
  const table = useReactTable<T>({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    enableSorting: false,
  })

  // Nothing dialed in yet — keep the dashboard uncluttered.
  if (data.length === 0) return null

  return (
    <Card className="flex flex-row items-center gap-4 p-4">
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        <h2 className="text-lg font-semibold">{title}</h2>
        <DataTable table={table} renderSubComponent={renderDetails} />
      </div>
    </Card>
  )
}
