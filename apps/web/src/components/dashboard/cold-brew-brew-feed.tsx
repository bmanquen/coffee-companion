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
import { formatBrewRatio } from '@/lib/brew-ratio'

const columnHelper = createColumnHelper<ColdBrewBrewWithRelations>()

// Face columns: the coffee (with dialed-in crosshair), a hero water:dose ratio,
// then the core cold brew stats — steep time reads in hours/minutes, not
// seconds. Cold brew is methodless (ADR-0001), so there's no Method Variant
// column. Grinder, device, Brew Environment, days off roast and notes live in
// the expander (BrewDetails).
const columns = [
  dialedInCoffeeColumn<ColdBrewBrewWithRelations>(),
  columnHelper.display({
    id: 'ratio',
    header: 'Ratio',
    // The hero metric — emphasised so it reads first against the muted stats.
    cell: ({ row }) => (
      <span className="font-semibold text-foreground">
        {formatBrewRatio(row.original.dose, row.original.water)}
      </span>
    ),
  }),
  columnHelper.accessor('dose', {
    header: 'Dose',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
  }),
  columnHelper.accessor('water', {
    header: 'Water',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
  }),
  columnHelper.accessor('steepTime', {
    header: 'Steep',
    // Cold brew stores steep time as whole minutes, not seconds.
    cell: (info) => formatSteepMinutes(info.getValue()),
  }),
  columnHelper.accessor('grindSetting', {
    header: 'Grind',
    cell: (info) => info.getValue() ?? '-',
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
          ratio={formatBrewRatio(row.original.dose, row.original.water)}
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
