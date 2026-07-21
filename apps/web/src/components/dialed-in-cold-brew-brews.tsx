import { useSuspenseQuery } from '@tanstack/react-query'
import {
  ColdBrewDetails,
  coldBrewColumnHelper,
  coldBrewExpanderColumn,
  coldBrewSummaryColumns,
} from './cold-brew-summary'
import { DialedInBrewsCard } from '@/components/brews/dialed-in-brews-card'
import { useTRPC } from '@/integrations/trpc/react'

export const MAX_BREWS = 10

const columns = [
  coldBrewColumnHelper.accessor('coffee.name', {
    header: 'Coffee',
    meta: { cardTitle: true },
  }),
  ...coldBrewSummaryColumns,
  coldBrewExpanderColumn,
]

// The coffee's dialed-in cold brews on the dashboard. Cold brew is methodless
// (ADR-0001), so there is at most one dialed-in cold brew per coffee — no method
// column, unlike the other immersion methods.
export function DialedInColdBrewBrews() {
  const trpc = useTRPC()

  const { data } = useSuspenseQuery(
    trpc.coldBrewBrew.getDialedIn.queryOptions({ limit: MAX_BREWS }),
  )

  return (
    <DialedInBrewsCard
      title="Dialed In Cold Brew"
      data={data}
      columns={columns}
      renderDetails={(row) => <ColdBrewDetails row={row} />}
    />
  )
}
