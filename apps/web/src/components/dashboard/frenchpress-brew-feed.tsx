import { useSuspenseQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import type { FrenchpressBrewWithRelations } from '@/types'
import {
  BrewDetails,
  brewExpanderColumn,
  brewRatioColumn,
  dialedInCoffeeColumn,
} from '@/components/brews/brew-details'
import { BrewFeed } from '@/components/dashboard/brew-feed'
import { useTRPC } from '@/integrations/trpc/react'
import { daysOffRoast } from '@/lib/brew'
import { formatBrewRatio } from '@/lib/brew-ratio'

const columnHelper = createColumnHelper<FrenchpressBrewWithRelations>()

// The dial-in summary (see ADR-0002): coffee identity, the Method Variant, then
// the french press levers — grind, real weights (dose→water), steep time — with
// a muted ratio hint. Grinder, device, water temp, days off roast and notes
// live in the expander (BrewDetails).
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
    meta: { cardSummary: true },
  }),
  columnHelper.accessor('water', {
    header: 'Water',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
    meta: { cardSummary: true },
  }),
  columnHelper.accessor('steepTime', {
    header: 'Steep',
    cell: (info) => (info.getValue() ? `${info.getValue()}s` : '-'),
    meta: { cardSummary: true },
  }),
  brewRatioColumn<FrenchpressBrewWithRelations>((row) =>
    formatBrewRatio(row.dose, row.water),
  ),
  brewExpanderColumn<FrenchpressBrewWithRelations>(),
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
      renderDetails={(row) => (
        <BrewDetails
          grinder={row.original.grinder}
          device={row.original.brewingDevice}
          extra={
            row.original.waterTemp != null
              ? { label: 'Water temp', value: `${row.original.waterTemp}°C` }
              : undefined
          }
          daysOffRoast={daysOffRoast(
            row.original.roastDate,
            row.original.createdAt,
          )}
          notes={row.original.notes}
        />
      )}
      newTo="/frenchpress/new"
      logLabel="Log Brew"
      emptyMessage="No french press brews yet."
      emptyLinkLabel="Log your first french press brew"
    />
  )
}
