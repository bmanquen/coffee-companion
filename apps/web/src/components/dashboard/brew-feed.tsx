import { Link } from '@tanstack/react-router'
import {
  createExpandedRowModel,
  createPaginatedRowModel,
  useTable,
} from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BrewsEmptyState } from '@/components/brews/brews-empty-state'
import { SealedRowNotice, sealedRowClass } from '@/components/brews/sealed-row'
import { CoffeeFilter } from '@/components/coffee-filter'
import { DataTable, withRowModels } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAccordionExpansion } from '@/hooks/use-accordion-expansion'
import type { CoffeeFilterOption } from '@/components/coffee-filter'
import type { ReactNode } from 'react'
import type { ColumnDef, PaginationState, Row } from '@tanstack/react-table'
import type { LinkProps } from '@tanstack/react-router'
import type { AppFeatures } from '@/components/data-table'

const features = withRowModels({
  expandedRowModel: createExpandedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
})

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
  loadingMore = false,
  loadMoreError,
  onExpand,
  onPageChange,
}: {
  title: string
  brews: Array<T>
  // TanStack itself types its columns option with `any` for the cell value.
  columns: Array<ColumnDef<AppFeatures, T, any>>
  renderDetails: (row: Row<AppFeatures, T>) => ReactNode
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
  // Fetches the next server page, resolving with the first appended row's id
  // (null if none). Next on the last loaded page uses it, then moves there.
  loadMore?: () => Promise<string | null>
  // The shot query is busy, so a load started now would be dropped.
  loadingMore?: boolean
  // Why the last loadMore failed; shown under the table with a retry.
  loadMoreError?: string | null
  // Runs when the user opens or closes a row's details.
  onExpand?: () => void
  // Runs when the user pages with Next or Previous, not when a filter or a
  // shrinking list moves the page.
  onPageChange?: () => void
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
  // The first row a Next load appended, to move to once it renders, with the
  // navGeneration it was loaded in.
  const [pendingRow, setPendingRow] = useState<{
    id: string
    generation: number
  } | null>(null)
  // Bumped on each filter change and manual page change, so a load that
  // settles after either cannot move this table.
  const navGeneration = useRef(0)

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
    navGeneration.current += 1
    setPendingRow(null)
    setPagination((current) =>
      current.pageIndex === 0 ? current : { ...current, pageIndex: 0 },
    )
  }, [coffeeId, dialedInOnly])

  // Move to the page holding the first appended row once it renders. Found
  // by id, since a refresh before the append can change the rows above it.
  useEffect(() => {
    if (pendingRow == null) return
    // A filter or page change since the load cancels the move, even when it
    // lands in the same render as the loaded row.
    if (pendingRow.generation !== navGeneration.current) {
      setPendingRow(null)
      return
    }
    const index = visibleBrews.findIndex((brew) => brew.id === pendingRow.id)
    if (index < 0) return
    setPendingRow(null)
    setPagination((current) => ({
      ...current,
      pageIndex: Math.floor(index / current.pageSize),
    }))
  }, [pendingRow, visibleBrews])

  const loadNextPage =
    loadMore && hasMore
      ? () => {
          const generation = navGeneration.current
          void loadMore().then((firstId) => {
            // A failed or empty request leaves the current page in place.
            if (firstId && generation === navGeneration.current) {
              setPendingRow({ id: firstId, generation })
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

  const table = useTable({
    features,
    data: visibleBrews,
    columns,
    // Accordion: opening one brew collapses the others (see grilling decision).
    state: { expanded: expansion.expanded, pagination },
    onExpandedChange: (updater) => {
      expansion.onExpandedChange(updater)
      onExpand?.()
    },
    // Paging by hand cancels a pending move to newly loaded rows.
    onPaginationChange: (updater) => {
      navGeneration.current += 1
      setPendingRow(null)
      setPagination(updater)
      onPageChange?.()
    },
    autoResetPageIndex: false,
    // By id, so a filter or refresh cannot move the open row to another brew.
    getRowId: (brew) => brew.id,
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
                loadNextPage={loadingMore ? undefined : loadNextPage}
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
          {status == null && loadMoreError && loadNextPage ? (
            <div className="flex flex-col gap-2">
              <p role="alert">{loadMoreError}</p>
              <Button
                type="button"
                variant="outline"
                disabled={loadingMore}
                onClick={loadNextPage}
              >
                Try again
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Card>
  )
}
