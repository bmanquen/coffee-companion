import { useSuspenseQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import type { FrenchpressBrewWithRelations } from '@/types'
import {
  dialedInCoffeeColumn,
  renderBrewDetails,
  waterTempExtra,
} from '@/components/brews/brew-details'
import { BrewFeed } from '@/components/dashboard/brew-feed'
import { expanderColumn } from '@/components/data-table'
import { useTRPC } from '@/integrations/trpc/react'
import { formatBrewSeconds } from '@/lib/brew'

const columnHelper = createColumnHelper<FrenchpressBrewWithRelations>()

// The dial-in summary (see ADR-0002): coffee identity, the Method Variant, then
// the french press levers — grind, real weights (dose→water), and steep time.
// Grinder, device, water temp, days off roast and notes live in the expander
// (BrewDetails).
const columns = [
  dialedInCoffeeColumn<FrenchpressBrewWithRelations>(),
  columnHelper.accessor('method.name', {
    header: 'Method',
    cell: (info) => info.getValue(),
    meta: { cardSummary: true },
  }),
  columnHelper.accessor('grindSetting', {
    header: 'Grind',
    cell: (info) => info.getValue() ?? '-',
    meta: { cardSummary: true, cardSummaryLabel: true },
  }),
  columnHelper.accessor('dose', {
    header: 'Dose',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
    meta: { cardSummary: true, cardSummaryLabel: true },
  }),
  columnHelper.accessor('water', {
    header: 'Water',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
    meta: { cardSummary: true, cardSummaryLabel: true },
  }),
  columnHelper.accessor('steepTime', {
    header: 'Steep',
    cell: (info) => formatBrewSeconds(info.getValue()),
    meta: { cardSummary: true, cardSummaryLabel: true },
  }),
  expanderColumn<FrenchpressBrewWithRelations>(),
]

// The French Press tab of the dashboard: the full french press history as a
// reference-only feed. Loads the method's getAll and hands it to BrewFeed.
export function FrenchpressBrewFeed() {
  const trpc = useTRPC()
  const { data: brews } = useSuspenseQuery(
    trpc.frenchpressBrew.getAll.queryOptions(),
  )

  return (
    <BrewFeed
      title="French Press"
      brews={brews}
      columns={columns}
      renderDetails={(row) =>
        renderBrewDetails(row.original, waterTempExtra(row.original.waterTemp))
      }
      newTo="/frenchpress/new"
      logLabel="Log Brew"
      emptyMessage="No french press brews yet."
      emptyLinkLabel="Log your first french press brew"
    />
  )
}
