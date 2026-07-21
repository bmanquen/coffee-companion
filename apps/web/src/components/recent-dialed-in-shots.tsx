import { useSuspenseQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import type { EspressoShotWithRelations } from '@/types'
import {
  BrewDetails,
  brewExpanderColumn,
} from '@/components/brews/brew-details'
import { DialedInBrewsCard } from '@/components/brews/dialed-in-brews-card'
import { useTRPC } from '@/integrations/trpc/react'
import { daysOffRoast } from '@/lib/brew'
import { formatBrewRatio } from '@/lib/brew-ratio'

export const MAX_SHOTS = 5

const columnHelper = createColumnHelper<EspressoShotWithRelations>()

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
  brewExpanderColumn<EspressoShotWithRelations>(),
]

export function RecentDialedInShots() {
  const trpc = useTRPC()

  const { data } = useSuspenseQuery(
    trpc.espressoShot.getDialedIn.queryOptions({ limit: MAX_SHOTS }),
  )

  return (
    <DialedInBrewsCard
      title="Recent Dialed In"
      data={data}
      columns={columns}
      renderDetails={(row) => (
        <BrewDetails
          grinder={row.original.grinder}
          device={row.original.brewingDevice}
          ratio={formatBrewRatio(row.original.dose, row.original.yield)}
          notes={row.original.notes}
        />
      )}
    />
  )
}
