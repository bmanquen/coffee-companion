import { useSuspenseQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Card } from './ui/card'
import type { PouroverBrewWithRelations } from '@/types'
import {
  BrewDetails,
  brewExpanderColumn,
} from '@/components/brews/brew-details'
import { DataTable } from '@/components/data-table'
import { useTRPC } from '@/integrations/trpc/react'
import { daysOffRoast } from '@/lib/brew'
import { formatBrewRatio } from '@/lib/brew-ratio'

export const MAX_BREWS = 10

const columnHelper = createColumnHelper<PouroverBrewWithRelations>()

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
  columnHelper.accessor('brewTime', {
    header: 'Brew',
    cell: (info) => (info.getValue() ? `${info.getValue()}s` : '-'),
  }),
  columnHelper.accessor('grindSetting', {
    header: 'Grind',
    cell: (info) => info.getValue() ?? '-',
  }),
  brewExpanderColumn<PouroverBrewWithRelations>(),
]

// The coffee's dialed-in pour over brews on the dashboard, one row per method —
// a coffee can have a dialed-in brew per method.
export function DialedInPouroverBrews() {
  const trpc = useTRPC()

  const { data } = useSuspenseQuery(
    trpc.pouroverBrew.getDialedIn.queryOptions({ limit: MAX_BREWS }),
  )

  const table = useReactTable<PouroverBrewWithRelations>({
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
        <h2 className="text-lg font-semibold">Dialed In Pour Over</h2>
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
