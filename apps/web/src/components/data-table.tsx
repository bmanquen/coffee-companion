import { flexRender } from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Fragment, useState } from 'react'
import type {
  Cell,
  Column,
  Row,
  RowData,
  Table as TanstackTable,
} from '@tanstack/react-table'
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

// Controls how each column renders in the mobile card layout (< md).
// Columns with no meta become a labeled value row by default.
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    // Render this column as the card's heading (no label).
    cardTitle?: boolean
    // Render this column's value without a label, in the card's top-right
    // (e.g. an actions column, or an expand chevron).
    cardHideLabel?: boolean
    // Keep this labeled value out of the card's collapsed summary; only show it
    // once the card is expanded. Only meaningful with renderSubComponent.
    cardExpandedOnly?: boolean
    // Omit this column from the card layout entirely.
    cardHidden?: boolean
  }
}

// The card layout has no header row, so derive a label from the column's
// header when it's a plain string, falling back to the column id.
function cardLabel<T>(column: Column<T, unknown>): string {
  const header = column.columnDef.header
  return typeof header === 'string' ? header : column.id
}

// A stack of label/value rows for the mobile card layout.
function CardRows<T>({
  cells,
  className,
}: {
  cells: Array<Cell<T, unknown>>
  className?: string
}) {
  'use no memo'
  return (
    <dl className={cn('flex flex-col gap-1', className)}>
      {cells.map((cell) => (
        <div key={cell.id} className="flex justify-between gap-4 text-sm">
          <dt className="text-muted-foreground">{cardLabel(cell.column)}</dt>
          <dd className="text-right">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </dd>
        </div>
      ))}
    </dl>
  )
}

// One row rendered as a card in the mobile layout. Splits cells into a heading
// (cardTitle), top-right icons (cardHideLabel), a collapsed summary, and an
// expanded section (cardExpandedOnly columns + renderSubComponent).
function DataCard<T>({
  row,
  renderSubComponent,
  cardExpandable,
  className,
}: {
  row: Row<T>
  renderSubComponent?: (row: Row<T>) => ReactNode
  cardExpandable?: boolean
  className?: string
}) {
  'use no memo'
  // Card-local expansion for cardExpandable mode; ignored when the table itself
  // drives expansion via renderSubComponent.
  const [localExpanded, setLocalExpanded] = useState(false)

  const cells = row.getVisibleCells()
  const titleCells = cells.filter((cell) => cell.column.columnDef.meta?.cardTitle)
  const actionCells = cells.filter(
    (cell) => cell.column.columnDef.meta?.cardHideLabel,
  )
  const bodyCells = cells.filter((cell) => {
    const meta = cell.column.columnDef.meta
    return !meta?.cardTitle && !meta?.cardHideLabel && !meta?.cardHidden
  })
  const summaryCells = bodyCells.filter(
    (cell) => !cell.column.columnDef.meta?.cardExpandedOnly,
  )
  const expandedCells = bodyCells.filter(
    (cell) => cell.column.columnDef.meta?.cardExpandedOnly,
  )

  const tableExpandable = Boolean(renderSubComponent)
  const canExpand =
    tableExpandable || (Boolean(cardExpandable) && expandedCells.length > 0)
  const expanded = tableExpandable ? row.getIsExpanded() : localExpanded
  const toggle = () => {
    if (tableExpandable) row.toggleExpanded()
    else setLocalExpanded((value) => !value)
  }
  const hasHeader = titleCells.length > 0 || actionCells.length > 0

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4',
        canExpand && 'cursor-pointer',
        className,
      )}
      onClick={canExpand ? toggle : undefined}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-2">
          <div className="font-medium">
            {titleCells.map((cell, index) => (
              <Fragment key={cell.id}>
                {index > 0 && ' '}
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </Fragment>
            ))}
          </div>
          {actionCells.length > 0 && (
            // Actions toggle their own behaviour; don't let the click bubble
            // up and expand/collapse the card.
            <div
              className="flex items-center gap-1"
              onClick={(event) => event.stopPropagation()}
            >
              {actionCells.map((cell) => (
                <Fragment key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </Fragment>
              ))}
            </div>
          )}
        </div>
      )}
      {summaryCells.length > 0 && (
        <CardRows cells={summaryCells} className={cn(hasHeader && 'mt-2')} />
      )}
      {expanded && (expandedCells.length > 0 || renderSubComponent) && (
        <div className="mt-3 flex flex-col gap-2 border-t pt-3">
          {expandedCells.length > 0 && <CardRows cells={expandedCells} />}
          {renderSubComponent?.(row)}
        </div>
      )}
      {canExpand && (
        <div className="mt-2 flex justify-center">
          <ChevronDown
            aria-hidden
            className={cn(
              'h-5 w-5 text-muted-foreground transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </div>
      )}
    </div>
  )
}

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
  // When true, the mobile card layout collapses cardExpandedOnly columns behind
  // a chevron, expanded via card-local state. Unlike renderSubComponent this
  // does NOT touch the desktop table — use it when the desktop table already
  // shows every column but the mobile card should stay compact.
  cardExpandable?: boolean
  // Extra classes applied per row (desktop <tr>) and per card (mobile), derived
  // from the row's data — e.g. to highlight rows that match some condition.
  rowClassName?: (row: Row<T>) => string | undefined
}

export function DataTable<T>({
  table,
  renderSubComponent,
  paginated,
  cardExpandable,
  rowClassName,
}: DataTableProps<T>) {
  // TanStack Table's instance is a stable, mutable object; React Compiler would
  // otherwise memoize getHeaderGroups()/getRowModel() and never re-derive rows
  // when sorting state changes. Opt this component out of the compiler.
  'use no memo'
  const rows = table.getRowModel().rows
  const colCount = table.getAllColumns().length
  return (
    <>
      {/* Desktop: real table */}
      <div className="hidden md:block">
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
                className={cn(
                  renderSubComponent && 'cursor-pointer',
                  rowClassName?.(row),
                )}
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
      </div>
      {/* Mobile: one card per row */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No results.
          </p>
        ) : (
          rows.map((row) => (
            <DataCard
              key={row.id}
              row={row}
              renderSubComponent={renderSubComponent}
              cardExpandable={cardExpandable}
              className={rowClassName?.(row)}
            />
          ))
        )}
      </div>
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
