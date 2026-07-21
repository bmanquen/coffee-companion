import { Link } from '@tanstack/react-router'
import {
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Loader2 } from 'lucide-react'
import type { LinkProps } from '@tanstack/react-router'
import type { ColumnDef, Row } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import { BrewsEmptyState } from '@/components/brews/brews-empty-state'
import { DataTable } from '@/components/data-table'
import { PaginationControls } from '@/components/pagination-controls'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useDelayedFlag } from '@/hooks/use-delayed-flag'
import { cn } from '@/lib/utils'

// The dashboard paginated "Recent {method}" card shell, shared by the espresso
// and cold brew recent cards. The caller runs the per-method getRecent query
// (the trpc procedure differs) and passes the page state + result; the shell
// owns the header, loading/empty/table states, the dialed-in row highlight, and
// pagination. Method-specific columns/details are composed in by each card.
export function RecentBrewsCard<T extends { isDialedIn: boolean }>({
  title,
  newTo,
  logLabel,
  emptyMessage,
  emptyLinkLabel,
  query,
  page,
  onPageChange,
  pageSize,
  columns,
  renderDetails,
}: {
  title: string
  newTo: LinkProps['to']
  logLabel: string
  emptyMessage: string
  emptyLinkLabel: string
  query: {
    data: { items: Array<T>; total: number } | undefined
    isLoading: boolean
    isPlaceholderData: boolean
  }
  page: number
  onPageChange: (page: number) => void
  pageSize: number
  // TanStack itself types its columns option with `any` for the cell value.
  columns: Array<ColumnDef<T, any>>
  renderDetails: (row: Row<T>) => ReactNode
}) {
  const { data, isLoading, isPlaceholderData } = query

  // Only true while a genuine, uncached fetch is in flight (cached pages swap
  // in instantly). The delay keeps quick fetches from flashing the spinner.
  const showLoader = useDelayedFlag(isPlaceholderData)

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0

  const table = useReactTable<T>({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    enableSorting: false,
  })

  return (
    <Card className="flex flex-row items-center gap-4 p-4">
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        <div className="flex justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Link to={newTo}>
            <Button variant="outline" size="sm">
              {logLabel}
            </Button>
          </Link>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <BrewsEmptyState
            message={emptyMessage}
            to={newTo}
            linkLabel={emptyLinkLabel}
          />
        ) : (
          <>
            <div className="relative">
              <div
                className={cn(
                  'transition-opacity duration-200',
                  showLoader && 'opacity-50',
                )}
              >
                <DataTable
                  table={table}
                  renderSubComponent={renderDetails}
                  rowClassName={(row) =>
                    row.original.isDialedIn
                      ? 'bg-primary/10 hover:bg-primary/15'
                      : undefined
                  }
                />
              </div>
              <div
                className={cn(
                  'pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-200',
                  showLoader ? 'opacity-100' : 'opacity-0',
                )}
              >
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            </div>
            <PaginationControls
              page={page}
              totalPages={totalPages}
              onPageChange={onPageChange}
            />
          </>
        )}
      </div>
    </Card>
  )
}
