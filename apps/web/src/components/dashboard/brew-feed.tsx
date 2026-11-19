import { Link } from '@tanstack/react-router'
import {
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BrewsEmptyState } from '@/components/brews/brews-empty-state'
import { SealedRowNotice, sealedRowClass } from '@/components/brews/sealed-row'
import { CoffeeFilter } from '@/components/coffee-filter'
import { DataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAccordionExpansion } from '@/hooks/use-accordion-expansion'
import type { CoffeeFilterOption } from '@/components/coffee-filter'
import type { ReactNode } from 'react'
import type { ColumnDef, PaginationState, Row } from '@tanstack/react-table'
import type { LinkProps } from '@tanstack/react-router'

// The minimum a brew needs to expose to be shown in the feed: an id, whether
// it's the dialed-in reference, and its coffee (for the highlight and filter).
type BrewRow = {
  id: string
  isDialedIn: boolean
  coffeeId: string
  coffee: { name: string }
  sealed: boolean
}

export type BrewFeedFilter<T> = {
  value: T
  onChange: (value: T) => void
}

// Filters run client-side unless the parent owns them (espresso filters on the server).
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
  coffeeFilter,
  dialedInFilter,
  banner,
  stale,
  status,
  hasMore = false,
  loadMore,
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
  coffeeFilter?: BrewFeedFilter<string>
  dialedInFilter?: BrewFeedFilter<boolean>
  banner?: ReactNode
  stale?: boolean
  status?: ReactNode
  // Another server page exists, so an empty list is not an empty history.
  hasMore?: boolean
  // Fetches the next server page, resolving true once rows were appended.
  // Next on the last loaded page uses it, then moves to the appended rows.
  loadMore?: () => Promise<boolean>
}) {
  // TanStack Table's instance is a stable, mutable object the React Compiler
  // would otherwise over-memoize; opt this component out (mirrors DataTable).
  'use no memo'
  const [internalCoffeeId, setInternalCoffeeId] = useState('')
  const [internalDialedInOnly, setInternalDialedInOnly] = useState(false)
  const coffeeId = coffeeFilter?.value ?? internalCoffeeId
  const setCoffeeId = coffeeFilter?.onChange ?? setInternalCoffeeId
  const dialedInOnly = dialedInFilter?.value ?? internalDialedInOnly
  const setDialedInOnly = dialedInFilter?.onChange ?? setInternalDialedInOnly
  const expansion = useAccordionExpansion()
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })
  // The page Next asked for before its rows were loaded.
  const [pendingPage, setPendingPage] = useState<number | null>(null)
  // Bumped on each filter change, so a load started under other filters
  // cannot move this table.
  const filterGeneration = useRef(0)

  // Unique coffees that actually appear in this method's history, sorted by
  // name, unless the parent supplies the options.
  const coffeeOptions = useMemo(
    () =>
      coffeeOptionsProp ??
      Array.from(
        new Map(brews.map((b) => [b.coffeeId, b.coffee.name])).entries(),
      )
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [brews, coffeeOptionsProp],
  )
  const filterCoffeeOnClient = coffeeFilter == null
  const filterDialedInOnClient = dialedInFilter == null
  const filtering = Boolean(coffeeId || dialedInOnly)
  const showEmpty =
    status == null && brews.length === 0 && !filtering && !hasMore

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
    filterGeneration.current += 1
    setPendingPage(null)
    setPagination((current) =>
      current.pageIndex === 0 ? current : { ...current, pageIndex: 0 },
    )
  }, [coffeeId, dialedInOnly])

  // Move to the requested page once its rows render, not when the request
  // resolves, so the table never shows a page past its rows.
  useEffect(() => {
    if (pendingPage == null) return
    if (visibleBrews.length <= pendingPage * pagination.pageSize) return
    setPendingPage(null)
    setPagination((current) => ({ ...current, pageIndex: pendingPage }))
  }, [pendingPage, visibleBrews.length, pagination.pageSize])

  const loadNextPage =
    loadMore && hasMore
      ? () => {
          // The page holding the first appended row: the next page when this
          // one is full, or this one when the new rows finish filling it.
          const target = Math.floor(visibleBrews.length / pagination.pageSize)
          const generation = filterGeneration.current
          void loadMore().then((appended) => {
            // A failed or empty request leaves the current page in place.
            if (appended && generation === filterGeneration.current) {
              setPendingPage(target)
            }
          })
        }
      : undefined

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
    // By id, so a filter or refresh cannot move the open row to another brew.
    getRowId: (brew) => brew.id,
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
        <>
          {banner}
          <BrewsEmptyState
            message={emptyMessage}
            to={newTo}
            linkLabel={emptyLinkLabel}
          />
        </>
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
                loadNextPage={loadNextPage}
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
