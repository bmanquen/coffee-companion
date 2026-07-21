import { useSuspenseQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import type { AeropressBrewWithRelations } from '@/types'
import {
  BrewDetails,
  brewExpanderColumn,
} from '@/components/brews/brew-details'
import { DialedInBrewsCard } from '@/components/brews/dialed-in-brews-card'
import { useTRPC } from '@/integrations/trpc/react'
import { daysOffRoast } from '@/lib/brew'
import { formatBrewRatio } from '@/lib/brew-ratio'

export const MAX_BREWS = 10

const columnHelper = createColumnHelper<AeropressBrewWithRelations>()

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
  brewExpanderColumn<AeropressBrewWithRelations>(),
]

// The coffee's dialed-in AeroPress brews on the dashboard, one row per method
// (Standard, Inverted, …) — a coffee can have a dialed-in brew per method.
export function DialedInAeropressBrews() {
  const trpc = useTRPC()

  const { data } = useSuspenseQuery(
    trpc.aeropressBrew.getDialedIn.queryOptions({ limit: MAX_BREWS }),
  )

  return (
    <DialedInBrewsCard
      title="Dialed In AeroPress"
      data={data}
      columns={columns}
      renderDetails={(row) => (
        <BrewDetails
          grinder={row.original.grinder}
          device={row.original.brewingDevice}
          ratio={formatBrewRatio(row.original.dose, row.original.water)}
          notes={row.original.notes}
        />
      )}
    />
  )
}
