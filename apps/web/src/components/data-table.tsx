import {
  type Row,
  type Table as TanstackTable,
  flexRender,
} from '@tanstack/react-table'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'

interface DataTableProps<T> {
  table: TanstackTable<T>
  // When provided, rows become clickable to toggle an expanded detail row
  // rendered by this function. Requires the table to enable row expansion
  // (getExpandedRowModel + getRowCanExpand).
  renderSubComponent?: (row: Row<T>) => ReactNode
}

export function DataTable<T>({ table, renderSubComponent }: DataTableProps<T>) {
  // TanStack Table's instance is a stable, mutable object; React Compiler would
  // otherwise memoize getHeaderGroups()/getRowModel() and never re-derive rows
  // when sorting state changes. Opt this component out of the compiler.
  'use no memo'
  return (
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
        {table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={table.getAllColumns().length}
              className="h-24 text-center text-muted-foreground"
            >
              No results.
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
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
  )
}
