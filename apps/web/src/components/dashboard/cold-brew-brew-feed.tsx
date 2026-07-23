import { useSuspenseQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import type { ColdBrewBrewWithRelations } from '@/types'
import {
  BrewDetails,
  brewExpanderColumn,
  dialedInCoffeeColumn,
} from '@/components/brews/brew-details'
import { BrewFeed } from '@/components/dashboard/brew-feed'
import { useTRPC } from '@/integrations/trpc/react'
import { daysOffRoast, formatSteepMinutes } from '@/lib/brew'

const columnHelper = createColumnHelper<ColdBrewBrewWithRelations>()

// The dial-in summary (see ADR-0002): coffee identity, then the cold brew
// levers — grind, real weights (dose→water), steep time (in hours/minutes, not
// seconds). Cold brew is methodless (ADR-0001), so no
// Method Variant column. Grinder, device, Brew Environment, days off roast and
// notes live in the expander (BrewDetails).
const columns = [
  dialedInCoffeeColumn<ColdBrewBrewWithRelations>(),
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
    // Cold brew stores steep time as whole minutes, not seconds.
    cell: (info) => formatSteepMinutes(info.getValue()),
    meta: { cardSummary: true, cardSummaryLabel: true },
  }),
  brewExpanderColumn<ColdBrewBrewWithRelations>(),
]

// The Cold Brew tab of the dashboard: the full cold brew history as a
// reference-only feed. Loads the method's getAll and hands it to BrewFeed.
export function ColdBrewBrewFeed() {
  const trpc = useTRPC()
  const { data: brews } = useSuspenseQuery(
    trpc.coldBrewBrew.getAll.queryOptions(),
  )

  return (
    <BrewFeed
      title="Cold Brew"
      brews={brews}
      columns={columns}
      renderDetails={(row) => (
        <BrewDetails
          grinder={row.original.grinder}
          device={row.original.brewingDevice}
          extra={
            row.original.brewEnvironment
              ? {
                  label: 'Brew Environment',
                  value: row.original.brewEnvironment,
                }
              : undefined
          }
          daysOffRoast={daysOffRoast(
            row.original.roastDate,
            row.original.createdAt,
          )}
          notes={row.original.notes}
        />
      )}
      newTo="/cold-brew/new"
      logLabel="Log Brew"
      emptyMessage="No cold brews yet."
      emptyLinkLabel="Log your first cold brew"
    />
  )
}
