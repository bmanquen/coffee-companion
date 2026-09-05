import { useSuspenseQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import type { PouroverBrewWithRelations } from '@/types'
import {
  dialedInCoffeeColumn,
  renderBrewDetails,
  waterTempExtra,
} from '@/components/brews/brew-details'
import { BrewFeed } from '@/components/dashboard/brew-feed'
import { expanderColumn } from '@/components/data-table'
import { useTRPC } from '@/integrations/trpc/react'
import { formatBrewSeconds } from '@/lib/brew'

const columnHelper = createColumnHelper<PouroverBrewWithRelations>()

// The dial-in summary (see ADR-0002): coffee identity, the Method Variant, then
// the pour over levers — grind, real weights (dose→water), and brew time.
// Grinder, device, water temp, days off roast and notes live
// in the expander (BrewDetails).
const columns = [
  dialedInCoffeeColumn<PouroverBrewWithRelations>(),
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
  columnHelper.accessor('brewTime', {
    header: 'Brew',
    cell: (info) => formatBrewSeconds(info.getValue()),
    meta: { cardSummary: true, cardSummaryLabel: true },
  }),
  expanderColumn<PouroverBrewWithRelations>(),
]

// The Pour Over tab of the dashboard: the full pour over history as a
// reference-only feed. Loads the method's getAll and hands it to BrewFeed.
export function PouroverBrewFeed() {
  const trpc = useTRPC()
  const { data: brews } = useSuspenseQuery(
    trpc.pouroverBrew.getAll.queryOptions(),
  )

  return (
    <BrewFeed
      title="Pour Over"
      brews={brews}
      columns={columns}
      renderDetails={(row) =>
        renderBrewDetails(row.original, waterTempExtra(row.original.waterTemp))
      }
      newTo="/pourover/new"
      logLabel="Log Brew"
      emptyMessage="No pour over brews yet."
      emptyLinkLabel="Log your first pour over brew"
    />
  )
}
