import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Crosshair } from 'lucide-react'
import { useState } from 'react'
import {
  ColdBrewDetails,
  coldBrewColumnHelper,
  coldBrewExpanderColumn,
  coldBrewSummaryColumns,
} from './cold-brew-summary'
import { RecentBrewsCard } from '@/components/brews/recent-brews-card'
import { useTRPC } from '@/integrations/trpc/react'

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

  const query = useQuery(
    trpc.coldBrewBrew.getRecent.queryOptions(
      { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      { placeholderData: keepPreviousData },
    ),
  )

  return (
    <RecentBrewsCard
      title="Recent Cold Brews"
      newTo="/cold-brew/new"
      logLabel="Log Brew"
      emptyMessage="No cold brews yet."
      emptyLinkLabel="Log your first brew"
      query={query}
      page={page}
      onPageChange={setPage}
      pageSize={PAGE_SIZE}
      columns={columns}
      renderDetails={(row) => <ColdBrewDetails row={row} />}
    />
  )
}
