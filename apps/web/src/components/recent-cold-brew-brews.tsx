import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Crosshair, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Card } from './ui/card'
import {
  ColdBrewDetails,
  coldBrewColumnHelper,
  coldBrewExpanderColumn,
  coldBrewSummaryColumns,
} from './cold-brew-summary'
import type { ColdBrewBrewWithRelations } from '@/types'
import { DataTable } from '@/components/data-table'
import { PaginationControls } from '@/components/pagination-controls'
import { Button } from '@/components/ui/button'
import { useDelayedFlag } from '@/hooks/use-delayed-flag'
import { useTRPC } from '@/integrations/trpc/react'
import { cn } from '@/lib/utils'

export const PAGE_SIZE = 5

const columns = [
  coldBrewColumnHelper.accessor('coffee.name', {
    header: 'Coffee',
    cell: (info) => (
      <span className="flex items-center gap-1.5">
        {info.row.original.isDialedIn && (
          <Crosshair
            aria-label="Dialed in"
            className="h-4 w-4 shrink-0 text-primary"
          />
        )}
        {info.getValue()}
      </span>
    ),
    meta: { cardTitle: true },
  }),
  ...coldBrewSummaryColumns,
  coldBrewExpanderColumn,
]

export function RecentColdBrewBrews() {
  const trpc = useTRPC()
  const [page, setPage] = useState(0)

  const { data, isLoading, isPlaceholderData } = useQuery(
    trpc.coldBrewBrew.getRecent.queryOptions(
      { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      { placeholderData: keepPreviousData },
    ),
  )

  // Only true while a genuine, uncached fetch is in flight (cached pages swap
  // in instantly). The delay keeps quick fetches from flashing the spinner.
  const showLoader = useDelayedFlag(isPlaceholderData)

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0

  const table = useReactTable<ColdBrewBrewWithRelations>({
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
          <h2 className="text-lg font-semibold">Recent Cold Brews</h2>
          <Link to="/cold-brew/new">
            <Button variant="outline" size="sm">
              Log Brew
            </Button>
          </Link>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cold brews yet.{' '}
            <Link to="/cold-brew/new" className="underline">
              Log your first brew
            </Link>
            .
          </p>
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
                  renderSubComponent={(row) => <ColdBrewDetails row={row} />}
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
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </Card>
  )
}
