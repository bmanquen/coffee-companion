import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Card } from './ui/card'
import { useTRPC } from '@/integrations/trpc/react'
import { Button } from '@/components/ui/button'
import { PaginationControls } from '@/components/pagination-controls'
import { DataTable } from '@/components/data-table'
import { useDelayedFlag } from '@/hooks/use-delayed-flag'
import { cn } from '@/lib/utils'

export const PAGE_SIZE = 5

type Coffee = {
  id: string
  name: string
  notes: string | null
}

const columnHelper = createColumnHelper<Coffee>()

const columns = [
  columnHelper.accessor('name', { header: 'Name', meta: { cardTitle: true } }),
  columnHelper.accessor('notes', {
    header: 'Notes',
    cell: (info) => info.getValue() ?? '-',
  }),
]

export function RecentCoffees() {
  const trpc = useTRPC()
  const [page, setPage] = useState(0)

  const { data, isLoading, isPlaceholderData } = useQuery(
    trpc.coffee.getRecent.queryOptions(
      { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      { placeholderData: keepPreviousData },
    ),
  )

  // Only true while a genuine, uncached fetch is in flight (cached pages swap
  // in instantly). The delay keeps quick fetches from flashing the spinner.
  const showLoader = useDelayedFlag(isPlaceholderData)

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: false,
  })

  return (
    <Card className="flex flex-row items-center gap-4 p-4">
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        <div className="flex justify-between">
          <h2 className="text-lg font-semibold">Recent Coffees</h2>
          <Link to="/coffees/new">
            <Button variant="outline" size="sm">
              Add Coffee
            </Button>
          </Link>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No coffees yet.{' '}
            <Link to="/coffees/new" className="underline">
              Add your first coffee
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
                <DataTable table={table} />
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
