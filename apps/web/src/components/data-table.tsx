import { flexRender } from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Fragment } from 'react'
import type {
  Cell,
  Column,
  Row,
  RowData,
  Table as TanstackTable,
} from '@tanstack/react-table'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

// Controls how each column renders in the card layout (< lg: phones + tablets).
// A card is split into an always-visible summary and a detail region revealed
// on expand (see DataCard). Columns with no meta become a labeled detail row.
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    // Render this column as the card's heading (no label).
    cardTitle?: boolean
    // Render this column's value without a label, in the card's top-right
    // (e.g. an actions column, or an expand chevron).
    cardHideLabel?: boolean
    // Render this column's value in the always-visible summary line (the
    // minimal, pre-expand info). Everything else is detail, hidden until expand.
    cardSummary?: boolean
    // Within the summary line, prefix this column's value with its label
    // (e.g. "Grind 12"); omit for self-evident values (weights, a ratio).
    cardSummaryLabel?: boolean
    // Render this column as its own full-width row in the detail region, with
    // the label above the value (e.g. long free-text notes).
    cardFullWidth?: boolean
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

// A stack of label/value rows for a card's expanded detail region.
function CardRows<T>({
  cells,
  className,
}: {
  cells: Array<Cell<T, unknown>>
  className?: string
}) {
  'use no memo'
  return (
    <dl className={cn('gap-x-6 columns-2', className)}>
      {cells.map((cell) => (
        <div
          key={cell.id}
          className="flex break-inside-avoid gap-2 pb-1 text-sm"
        >
          <dt className="whitespace-nowrap text-muted-foreground">
            {cardLabel(cell.column)}
          </dt>
          <dd>{flexRender(cell.column.columnDef.cell, cell.getContext())}</dd>
        </div>
      ))}
    </dl>
  )
}

// One record rendered as a card in the mobile layout. Splits cells into a
// heading (cardTitle), a compact always-visible summary line (cardSummary),
// top-right actions (cardHideLabel), and a detail region — the remaining
// labeled cells, full-width cells, and renderSubComponent — revealed on expand.
// When a record has no detail (e.g. equipment), the card is flat: no chevron,
// not tappable. Otherwise tapping the card toggles its detail; action buttons
// stop the tap so they don't also expand it.
function DataCard<T>({
  row,
  renderSubComponent,
  className,
}: {
  row: Row<T>
  renderSubComponent?: (row: Row<T>) => ReactNode
  className?: string
}) {
  'use no memo'
  const cells = row.getVisibleCells()
  const titleCells = cells.filter(
    (cell) => cell.column.columnDef.meta?.cardTitle,
  )
  const summaryCells = cells.filter(
    (cell) => cell.column.columnDef.meta?.cardSummary,
  )
  const actionCells = cells.filter(
    (cell) => cell.column.columnDef.meta?.cardHideLabel,
  )
  const fullWidthCells = cells.filter(
    (cell) => cell.column.columnDef.meta?.cardFullWidth,
  )
  const detailCells = cells.filter((cell) => {
    const meta = cell.column.columnDef.meta
    return (
      !meta?.cardTitle &&
      !meta?.cardSummary &&
      !meta?.cardHideLabel &&
      !meta?.cardFullWidth &&
      !meta?.cardHidden
    )
  })

  const hasDetail =
    detailCells.length > 0 ||
    fullWidthCells.length > 0 ||
    renderSubComponent != null
  const isExpanded = hasDetail && row.getIsExpanded()

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4',
        hasDetail && 'cursor-pointer',
        className,
      )}
      onClick={hasDetail ? row.getToggleExpandedHandler() : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          {titleCells.length > 0 && (
            <div className="font-medium">
              {titleCells.map((cell, index) => (
                <Fragment key={cell.id}>
                  {index > 0 && ' '}
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </Fragment>
              ))}
            </div>
          )}
          {summaryCells.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
              {summaryCells.map((cell, index) => (
                <Fragment key={cell.id}>
                  {index > 0 && (
                    <span aria-hidden className="text-muted-foreground/40">
                      ·
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    {cell.column.columnDef.meta?.cardSummaryLabel && (
                      <span className="text-muted-foreground">
                        {cardLabel(cell.column)}
                      </span>
                    )}
                    <span className="text-foreground">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </span>
                  </span>
                </Fragment>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actionCells.length > 0 && (
            <div
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {actionCells.map((cell) => (
                <Fragment key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </Fragment>
              ))}
            </div>
          )}
          {hasDetail && (
            <ChevronDown
              aria-hidden
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform duration-200',
                isExpanded && 'rotate-180',
              )}
            />
          )}
        </div>
      </div>
      {hasDetail && (
        // Grid-rows 1fr↔0fr animates the detail's height without measuring it.
        <div
          className={cn(
            'grid transition-all duration-200 ease-out',
            isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mt-3 border-t pt-3">
              {detailCells.length > 0 && <CardRows cells={detailCells} />}
              {fullWidthCells.length > 0 && (
                <dl className={cn(detailCells.length > 0 && 'mt-2')}>
                  {fullWidthCells.map((cell) => (
                    <div key={cell.id} className="pb-1 text-sm">
                      <dt className="text-muted-foreground">
                        {cardLabel(cell.column)}
                      </dt>
                      <dd className="whitespace-pre-wrap break-words">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {renderSubComponent && (
                <div
                  className={cn(
                    (detailCells.length > 0 || fullWidthCells.length > 0) &&
                      'mt-2',
                  )}
                >
                  {renderSubComponent(row)}
                </div>
              )}
            </div>
          </div>
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
  // Extra classes applied per row (desktop <tr>) and per card (mobile), derived
  // from the row's data — e.g. to highlight rows that match some condition.
  rowClassName?: (row: Row<T>) => string | undefined
}

export function DataTable<T>({
  table,
  renderSubComponent,
  paginated,
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
      <div className="hidden lg:block">
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
                        <div className="flex items-center justify-center gap-1">
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
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  {renderSubComponent && row.getIsExpanded() && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={row.getVisibleCells().length}
                        className="bg-muted/50"
                      >
                        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                          {renderSubComponent(row)}
                        </div>
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
      <div className="flex flex-col gap-3 lg:hidden">
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
