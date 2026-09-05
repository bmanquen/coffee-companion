import { useSuspenseQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import type { AeropressBrewWithRelations } from '@/types'
import {
  dialedInCoffeeColumn,
  renderBrewDetails,
} from '@/components/brews/brew-details'
import { BrewFeed } from '@/components/dashboard/brew-feed'
import { expanderColumn } from '@/components/data-table'
import { useTRPC } from '@/integrations/trpc/react'
import { formatBrewSeconds } from '@/lib/brew'

const columnHelper = createColumnHelper<AeropressBrewWithRelations>()

// The dial-in summary (see ADR-0002): coffee identity, the Method Variant, then
// the aeropress levers — grind, real weights (dose→water), and steep time.
// Grinder, device, days off roast and notes live in the
// expander (BrewDetails). AeroPress has no water temp, so no extra field.
const columns = [
  dialedInCoffeeColumn<AeropressBrewWithRelations>(),
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
  expanderColumn<AeropressBrewWithRelations>(),
]

// The AeroPress tab of the dashboard: the full aeropress history as a
// reference-only feed. Loads the method's getAll and hands it to BrewFeed.
export function AeropressBrewFeed() {
  const trpc = useTRPC()
  const { data: brews } = useSuspenseQuery(
    trpc.aeropressBrew.getAll.queryOptions(),
  )

  return (
    <BrewFeed
      title="AeroPress"
      brews={brews}
      columns={columns}
      renderDetails={(row) => renderBrewDetails(row.original)}
      newTo="/aeropress/new"
      logLabel="Log Brew"
      emptyMessage="No aeropress brews yet."
      emptyLinkLabel="Log your first aeropress brew"
    />
  )
}
