import { Link } from '@tanstack/react-router'
import {
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { LinkProps } from '@tanstack/react-router'
import type { ColumnDef, Row } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import { BrewsEmptyState } from '@/components/brews/brews-empty-state'
import { CoffeeFilter } from '@/components/coffee-filter'
import { DataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// The minimum a brew needs to expose to be shown in the feed: an id, whether
// it's the dialed-in reference, and its coffee (for the highlight and filter).
type BrewRow = {
  id: string
  isDialedIn: boolean
  coffeeId: string
  coffee: { name: string }
}

// The dashboard's reference-only per-method Brew feed. Given a method's full
// brew history (from its getAll), it renders a glanceable, paginated feed of
// cards with the dialed-in Brew highlighted, a "dialed-in only" toggle and a
// by-coffee filter (both applied across the whole history before pagination),
// and a per-method log button. It carries no edit/delete/dialed-in controls —
// managing Brews stays on the Brews page. All filtering and pagination happen
// client-side over `brews`.
export function BrewFeed<T extends BrewRow>({
  title,
  brews,
  columns,
  renderDetails,
  newTo,
  logLabel,
  emptyMessage,
  emptyLinkLabel,
  pageSize = 5,
}: {
  title: string
  brews: Array<T>
  // TanStack itself types its columns option with `any` for the cell value.
  columns: Array<ColumnDef<T, any>>
  renderDetails: (row: Row<T>) => ReactNode
  newTo: LinkProps['to']
  logLabel: string
  emptyMessage: string
  emptyLinkLabel: string
  pageSize?: number
}) {
  // TanStack Table's instance is a stable, mutable object the React Compiler
  // would otherwise over-memoize; opt this component out (mirrors DataTable).
  'use no memo'
  const [coffeeId, setCoffeeId] = useState('')
  const [dialedInOnly, setDialedInOnly] = useState(false)

  // Unique coffees that actually appear in this method's history, sorted by name.
  const coffeeOptions = useMemo(
    () =>
      Array.from(
        new Map(brews.map((b) => [b.coffeeId, b.coffee.name])).entries(),
      )
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [brews],
  )

  // Memoized so the filtered array keeps a stable reference between renders —
  // a fresh array each render trips the table's autoReset* state and loops.
  const visibleBrews = useMemo(
    () =>
      brews.filter(
        (b) =>
          (!coffeeId || b.coffeeId === coffeeId) &&
          (!dialedInOnly || b.isDialedIn),
      ),
    [brews, coffeeId, dialedInOnly],
  )

  const table = useReactTable({
    data: visibleBrews,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowCanExpand: () => true,
    enableSorting: false,
    initialState: { pagination: { pageSize } },
  })

  return (
    <Card className="flex flex-col gap-4 w-full bg-white p-6">
      <div className="flex justify-between items-center w-full">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Link to={newTo}>
          <Button>
            <Plus />
            {logLabel}
          </Button>
        </Link>
      </div>
      {brews.length === 0 ? (
        <BrewsEmptyState
          message={emptyMessage}
          to={newTo}
          linkLabel={emptyLinkLabel}
        />
      ) : (
        <>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <CoffeeFilter
              options={coffeeOptions}
              value={coffeeId}
              onChange={setCoffeeId}
            />
            <Button
              type="button"
              variant={dialedInOnly ? 'default' : 'outline'}
              aria-pressed={dialedInOnly}
              onClick={() => setDialedInOnly((v) => !v)}
            >
              Dialed-in only
            </Button>
          </div>
          <DataTable
            table={table}
            renderSubComponent={renderDetails}
            paginated
            rowClassName={(row) =>
              row.original.isDialedIn
                ? 'bg-primary/10 hover:bg-primary/15'
                : undefined
            }
          />
        </>
      )}
    </Card>
  )
}
