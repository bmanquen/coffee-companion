import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  createColumnHelper,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronDown, Crosshair, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Card } from './ui/card'
import type { EspressoShotWithRelations } from '@/types'
import type { Row } from '@tanstack/react-table'
import { DataTable } from '@/components/data-table'
import { PaginationControls } from '@/components/pagination-controls'
import { Button } from '@/components/ui/button'
import { useDelayedFlag } from '@/hooks/use-delayed-flag'
import { useTRPC } from '@/integrations/trpc/react'
import { daysOffRoast } from '@/lib/brew'
import { formatBrewRatio } from '@/lib/brew-ratio'
import { cn } from '@/lib/utils'

export const PAGE_SIZE = 5

const columnHelper = createColumnHelper<EspressoShotWithRelations>()

const columns = [
  columnHelper.accessor('coffee.name', {
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
  columnHelper.accessor((row) => daysOffRoast(row.roastDate, row.createdAt), {
    id: 'daysOffRoast',
    header: 'Days off roast',
    cell: (info) => (info.getValue() != null ? `${info.getValue()}d` : '-'),
  }),
  columnHelper.accessor('dose', {
    header: 'Dose',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
  }),
  columnHelper.accessor('yield', {
    header: 'Yield',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
  }),
  columnHelper.accessor('time', {
    header: 'Time',
    cell: (info) => (info.getValue() ? `${info.getValue()}s` : '-'),
  }),
  columnHelper.accessor('grindSetting', {
    header: 'Grind',
    cell: (info) => info.getValue() ?? '-',
  }),
  columnHelper.display({
    id: 'expander',
    header: '',
    cell: ({ row }) => (
      <ChevronDown
        className={cn(
          'h-4 w-4 text-muted-foreground transition-transform',
          row.getIsExpanded() && 'rotate-180',
        )}
      />
    ),
    // Desktop uses this chevron column; the mobile card renders its own.
    meta: { cardHidden: true },
  }),
]

function ShotDetails({ row }: { row: Row<EspressoShotWithRelations> }) {
  const shot = row.original
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm py-1 sm:grid-cols-2">
      <div>
        <dt className="inline font-medium">Grinder: </dt>
        <dd className="inline text-muted-foreground">
          {shot.grinder.name} ({shot.grinder.brand})
        </dd>
      </div>
      <div>
        <dt className="inline font-medium">Device: </dt>
        <dd className="inline text-muted-foreground">
          {shot.brewingDevice.name} ({shot.brewingDevice.brand})
        </dd>
      </div>
      <div>
        <dt className="inline font-medium">Ratio: </dt>
        <dd className="inline text-muted-foreground">
          {formatBrewRatio(shot.dose, shot.yield)}
        </dd>
      </div>
      <div className="col-span-2">
        <dt className="inline font-medium">Notes: </dt>
        <dd className="inline text-muted-foreground">{shot.notes ?? '-'}</dd>
      </div>
    </dl>
  )
}

export function RecentEspressoShots() {
  const trpc = useTRPC()
  const [page, setPage] = useState(0)

  const { data, isLoading, isPlaceholderData } = useQuery(
    trpc.espressoShot.getRecent.queryOptions(
      { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      { placeholderData: keepPreviousData },
    ),
  )

  // Only true while a genuine, uncached fetch is in flight (cached pages swap
  // in instantly). The delay keeps quick fetches from flashing the spinner.
  const showLoader = useDelayedFlag(isPlaceholderData)

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0

  const table = useReactTable<EspressoShotWithRelations>({
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
          <h2 className="text-lg font-semibold">Recent Espresso Shots</h2>
          <Link to="/espresso/new">
            <Button variant="outline" size="sm">
              Log Shot
            </Button>
          </Link>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No espresso shots yet.{' '}
            <Link to="/espresso/new" className="underline">
              Log your first shot
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
                  renderSubComponent={(row) => <ShotDetails row={row} />}
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
