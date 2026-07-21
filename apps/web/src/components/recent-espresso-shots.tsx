import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { useState } from 'react'
import type { EspressoShotWithRelations } from '@/types'
import {
  BrewDetails,
  brewExpanderColumn,
  dialedInCoffeeColumn,
} from '@/components/brews/brew-details'
import { RecentBrewsCard } from '@/components/brews/recent-brews-card'
import { useTRPC } from '@/integrations/trpc/react'
import { daysOffRoast } from '@/lib/brew'
import { formatBrewRatio } from '@/lib/brew-ratio'

export const PAGE_SIZE = 5

const columnHelper = createColumnHelper<EspressoShotWithRelations>()

const columns = [
  dialedInCoffeeColumn<EspressoShotWithRelations>(),
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

export function RecentEspressoShots() {
  const trpc = useTRPC()
  const [page, setPage] = useState(0)

  const query = useQuery(
    trpc.espressoShot.getRecent.queryOptions(
      { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      { placeholderData: keepPreviousData },
    ),
  )

  return (
    <RecentBrewsCard
      title="Recent Espresso Shots"
      newTo="/espresso/new"
      logLabel="Log Shot"
      emptyMessage="No espresso shots yet."
      emptyLinkLabel="Log your first shot"
      query={query}
      page={page}
      onPageChange={setPage}
      pageSize={PAGE_SIZE}
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
