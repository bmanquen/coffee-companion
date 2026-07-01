import { flexRender } from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Fragment } from 'react'
import type { Row, Table as TanstackTable } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DataTableProps<T> {
  table: TanstackTable<T>
  // When provided, rows become clickable to toggle an expanded detail row
  // rendered by this function. Requires the table to enable row expansion
  // (getExpandedRowModel + getRowCanExpand).
  renderSubComponent?: (row: Row<T>) => ReactNode
  // When true, renders pagination controls and pads the current page with
  // blank rows so the table keeps a constant height that fits a full page.
  // Requires the table to enable pagination (getPaginationRowModel).
  paginated?: boolean
}

export function DataTable<T>({
  table,
  renderSubComponent,
  paginated,
}: DataTableProps<T>) {
  // TanStack Table's instance is a stable, mutable object; React Compiler would
  // otherwise memoize getHeaderGroups()/getRowModel() and never re-derive rows
  // when sorting state changes. Opt this component out of the compiler.
  'use no memo'
  const rows = table.getRowModel().rows
  const colCount = table.getAllColumns().length
  return (
    <>
      <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const canSort = header.column.getCanSort()
              const sorted = header.column.getIsSorted()
              return (
                <TableHead
                  key={header.id}
                  className={cn(canSort && 'cursor-pointer select-none')}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {header.isPlaceholder ? null : (
                    <div className="flex items-center gap-1">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {canSort && (
                        <span className="h-4 w-4">
                          {sorted === 'asc' ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-4 w-4" />
                          ) : (
                            <ArrowUpDown className="h-4 w-4 text-muted-foreground/50" />
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </TableHead>
              )
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={colCount}
              className="h-24 text-center text-muted-foreground"
            >
              No results.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <Fragment key={row.id}>
              <TableRow
                className={cn(renderSubComponent && 'cursor-pointer')}
                onClick={
                  renderSubComponent
                    ? row.getToggleExpandedHandler()
                    : undefined
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
              {renderSubComponent && row.getIsExpanded() && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={row.getVisibleCells().length}
                    className="bg-muted/50"
                  >
                    {renderSubComponent(row)}
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))
        )}
      </TableBody>
    </Table>
      {paginated && (
        <div className="flex items-center justify-between px-2 pt-4">
          <p className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{' '}
            {table.getPageCount() || 1}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
