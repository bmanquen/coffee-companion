import { useSuspenseQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import type { PouroverBrewWithRelations } from '@/types'
import {
  BrewDetails,
  brewExpanderColumn,
} from '@/components/brews/brew-details'
import { DialedInBrewsCard } from '@/components/brews/dialed-in-brews-card'
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

  return (
    <DialedInBrewsCard
      title="Dialed In Pour Over"
      data={data}
      columns={columns}
      renderDetails={(row) => (
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
  )
}
