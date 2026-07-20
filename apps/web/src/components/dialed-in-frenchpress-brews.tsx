import { useSuspenseQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Card } from './ui/card'
import type { FrenchpressBrewWithRelations } from '@/types'
import {
  BrewDetails,
  brewExpanderColumn,
} from '@/components/brews/brew-details'
import { DataTable } from '@/components/data-table'
import { useTRPC } from '@/integrations/trpc/react'
import { daysOffRoast } from '@/lib/brew'
import { formatBrewRatio } from '@/lib/brew-ratio'

export const MAX_BREWS = 10

const columnHelper = createColumnHelper<FrenchpressBrewWithRelations>()

const columns = [
  columnHelper.accessor('coffee.name', {
    header: 'Coffee',
    meta: { cardTitle: true },
  }),
  columnHelper.accessor('method.name', {
    header: 'Method',
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
    cell: (info) => (info.getValue() ? `${info.getValue()}s` : '-'),
  }),
  columnHelper.accessor('grindSetting', {
    header: 'Grind',
    cell: (info) => info.getValue() ?? '-',
  }),
  brewExpanderColumn<FrenchpressBrewWithRelations>(),
]

// The coffee's dialed-in french press brews on the dashboard, one row per method
// — a coffee can have a dialed-in brew per method.
export function DialedInFrenchpressBrews() {
  const trpc = useTRPC()

  const { data } = useSuspenseQuery(
    trpc.frenchpressBrew.getDialedIn.queryOptions({ limit: MAX_BREWS }),
  )

  const table = useReactTable<FrenchpressBrewWithRelations>({
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
        <h2 className="text-lg font-semibold">Dialed In French Press</h2>
        <DataTable
          table={table}
          renderSubComponent={(row) => (
            <BrewDetails
              grinder={row.original.grinder}
              device={row.original.brewingDevice}
              ratio={formatBrewRatio(row.original.dose, row.original.water)}
              extra={{
                label: 'Water temp',
                value:
                  row.original.waterTemp != null
                    ? `${row.original.waterTemp}°C`
                    : '-',
              }}
              notes={row.original.notes}
            />
          )}
        />
      </div>
    </Card>
  )
}
