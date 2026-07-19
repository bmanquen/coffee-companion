import { useSuspenseQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronDown } from 'lucide-react'
import { Card } from './ui/card'
import type { ColdBrewBrewWithRelations } from '@/types'
import type { Row } from '@tanstack/react-table'
import { DataTable } from '@/components/data-table'
import { useTRPC } from '@/integrations/trpc/react'
import { daysOffRoast, formatSteepMinutes } from '@/lib/brew'
import { formatBrewRatio } from '@/lib/brew-ratio'
import { cn } from '@/lib/utils'

export const MAX_BREWS = 10

const columnHelper = createColumnHelper<ColdBrewBrewWithRelations>()

const columns = [
  columnHelper.accessor('coffee.name', {
    header: 'Coffee',
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
  columnHelper.accessor('water', {
    header: 'Water',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
  }),
  columnHelper.accessor('steepTime', {
    header: 'Steep',
    cell: (info) => formatSteepMinutes(info.getValue()),
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

function BrewDetails({ row }: { row: Row<ColdBrewBrewWithRelations> }) {
  const brew = row.original
  return (
    <dl className="mx-auto grid max-w-2xl grid-cols-1 gap-x-8 gap-y-2 text-sm py-1 text-left sm:grid-cols-2">
      <div>
        <dt className="inline font-medium">Grinder: </dt>
        <dd className="inline text-muted-foreground">
          {brew.grinder.name} ({brew.grinder.brand})
        </dd>
      </div>
      <div>
        <dt className="inline font-medium">Device: </dt>
        <dd className="inline text-muted-foreground">
          {brew.brewingDevice.name} ({brew.brewingDevice.brand})
        </dd>
      </div>
      <div>
        <dt className="inline font-medium">Ratio: </dt>
        <dd className="inline text-muted-foreground">
          {formatBrewRatio(brew.dose, brew.water)}
        </dd>
      </div>
      <div>
        <dt className="inline font-medium">Environment: </dt>
        <dd className="inline text-muted-foreground">
          {brew.brewEnvironment ?? '-'}
        </dd>
      </div>
      <div className="col-span-2">
        <dt className="inline font-medium">Notes: </dt>
        <dd className="inline text-muted-foreground">{brew.notes ?? '-'}</dd>
      </div>
    </dl>
  )
}

// The coffee's dialed-in cold brews on the dashboard. Cold brew is methodless
// (ADR-0001), so there is at most one dialed-in cold brew per coffee — no method
// column, unlike the other immersion methods.
export function DialedInColdBrewBrews() {
  const trpc = useTRPC()

  const { data } = useSuspenseQuery(
    trpc.coldBrewBrew.getDialedIn.queryOptions({ limit: MAX_BREWS }),
  )

  const table = useReactTable<ColdBrewBrewWithRelations>({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    enableSorting: false,
  })

  // Nothing dialed in yet — keep the dashboard uncluttered.
  if (data.length === 0) return null

  return (
    <Card className="flex flex-row items-center gap-4 p-4">
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        <h2 className="text-lg font-semibold">Dialed In Cold Brew</h2>
        <DataTable
          table={table}
          renderSubComponent={(row) => <BrewDetails row={row} />}
        />
      </div>
    </Card>
  )
}
