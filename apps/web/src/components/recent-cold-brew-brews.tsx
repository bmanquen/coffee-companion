import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  ColdBrewDetails,
  coldBrewExpanderColumn,
  coldBrewSummaryColumns,
} from './cold-brew-summary'
import type { ColdBrewBrewWithRelations } from '@/types'
import { dialedInCoffeeColumn } from '@/components/brews/brew-details'
import { RecentBrewsCard } from '@/components/brews/recent-brews-card'
import { useTRPC } from '@/integrations/trpc/react'

export const PAGE_SIZE = 5

const columns = [
  dialedInCoffeeColumn<ColdBrewBrewWithRelations>(),
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
