import { Link } from '@tanstack/react-router'
import {
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { LinkProps } from '@tanstack/react-router'
import type { ColumnDef, PaginationState, Row } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import type { CoffeeFilterOption } from '@/components/coffee-filter'
import { BrewsEmptyState } from '@/components/brews/brews-empty-state'
import { SealedRowNotice, sealedRowClass } from '@/components/brews/sealed-row'
import { CoffeeFilter } from '@/components/coffee-filter'
import { DataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAccordionExpansion } from '@/hooks/use-accordion-expansion'

// The minimum a brew needs to expose to be shown in the feed: an id, whether
// it's the dialed-in reference, and its coffee (for the highlight and filter).
type BrewRow = {
  id: string
  isDialedIn: boolean
  coffeeId: string
  coffee: { name: string }
  sealed: boolean
}

// The dashboard's reference-only per-method Brew feed. Given the rows already
// loaded for that method, it renders a glanceable, paginated feed of
// cards with the dialed-in Brew highlighted, a "dialed-in only" toggle and a
// by-coffee filter, and a per-method log button. It carries no edit/delete/
// dialed-in controls — managing Brews stays on the Brews page. Filtering is
// client-side over `brews` unless the parent owns the coffee/dialed-in state
// (espresso pages the server). Pagination is client-side and keeps its page
// when more rows append.
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
  coffeeOptions: coffeeOptionsProp,
  coffeeId: coffeeIdProp,
  onCoffeeIdChange,
  dialedInOnly: dialedInOnlyProp,
  onDialedInOnlyChange,
  banner,
  stale,
  status,
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
  coffeeOptions?: Array<CoffeeFilterOption>
  coffeeId?: string
  onCoffeeIdChange?: (id: string) => void
  dialedInOnly?: boolean
  onDialedInOnlyChange?: (value: boolean) => void
  banner?: ReactNode
  stale?: boolean
  status?: ReactNode
}) {
  // TanStack Table's instance is a stable, mutable object the React Compiler
  // would otherwise over-memoize; opt this component out (mirrors DataTable).
  'use no memo'
  const [internalCoffeeId, setInternalCoffeeId] = useState('')
  const [internalDialedInOnly, setInternalDialedInOnly] = useState(false)
  const coffeeId = coffeeIdProp ?? internalCoffeeId
  const setCoffeeId = onCoffeeIdChange ?? setInternalCoffeeId
  const dialedInOnly = dialedInOnlyProp ?? internalDialedInOnly
  const setDialedInOnly = onDialedInOnlyChange ?? setInternalDialedInOnly
  const expansion = useAccordionExpansion()
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })

  // Unique coffees that actually appear in this method's history, sorted by name.
  const derivedCoffeeOptions = useMemo(
    () =>
      Array.from(
        new Map(brews.map((b) => [b.coffeeId, b.coffee.name])).entries(),
      )
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [brews],
  )
  const coffeeOptions = coffeeOptionsProp ?? derivedCoffeeOptions
  const filterCoffeeOnClient = onCoffeeIdChange == null
  const filterDialedInOnClient = onDialedInOnlyChange == null
  const filtering = Boolean(coffeeId || dialedInOnly)
  const showEmpty = status == null && brews.length === 0 && !filtering

  // Memoized so the filtered array keeps a stable reference between renders —
  // a fresh array each render trips the table's autoReset* state and loops.
  const visibleBrews = useMemo(
    () =>
      brews.filter(
        (b) =>
          (!filterCoffeeOnClient || !coffeeId || b.coffeeId === coffeeId) &&
          (!filterDialedInOnClient || !dialedInOnly || b.isDialedIn),
      ),
    [
      brews,
      coffeeId,
      dialedInOnly,
      filterCoffeeOnClient,
      filterDialedInOnClient,
    ],
  )

  useEffect(() => {
    setPagination((current) =>
      current.pageIndex === 0 ? current : { ...current, pageIndex: 0 },
    )
  }, [coffeeId, dialedInOnly])

  useEffect(() => {
    setPagination((current) => {
      const pageCount = Math.max(
        1,
        Math.ceil(visibleBrews.length / current.pageSize),
      )
      const pageIndex = Math.min(current.pageIndex, pageCount - 1)
      return pageIndex === current.pageIndex
        ? current
        : { ...current, pageIndex }
    })
  }, [visibleBrews.length])

  const table = useReactTable({
    data: visibleBrews,
    columns,
    // Accordion: opening one brew collapses the others (see grilling decision).
    state: { expanded: expansion.expanded, pagination },
    onExpandedChange: expansion.onExpandedChange,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // A Sealed Brew has no settings to reveal.
    getRowCanExpand: (row) => !row.original.sealed,
    enableSorting: false,
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
      {showEmpty ? (
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
              onClick={() => setDialedInOnly(!dialedInOnly)}
            >
              Dialed-in only
            </Button>
          </div>
          {banner}
          {status ?? (
            <div
              aria-busy={stale || undefined}
              className={stale ? 'opacity-60' : undefined}
            >
              <DataTable
                table={table}
                renderSubComponent={renderDetails}
                replaceRow={(row) =>
                  row.original.sealed ? <SealedRowNotice /> : null
                }
                paginated
                rowClassName={(row) =>
                  row.original.sealed
                    ? sealedRowClass
                    : row.original.isDialedIn
                      ? 'bg-primary/10 hover:bg-primary/15'
                      : undefined
                }
              />
            </div>
          )}
        </>
      )}
    </Card>
  )
}
