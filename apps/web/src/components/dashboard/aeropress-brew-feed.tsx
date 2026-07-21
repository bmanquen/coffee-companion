import { useSuspenseQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import type { AeropressBrewWithRelations } from '@/types'
import {
  BrewDetails,
  brewExpanderColumn,
  dialedInCoffeeColumn,
} from '@/components/brews/brew-details'
import { BrewFeed } from '@/components/dashboard/brew-feed'
import { useTRPC } from '@/integrations/trpc/react'
import { daysOffRoast } from '@/lib/brew'
import { formatBrewRatio } from '@/lib/brew-ratio'

const columnHelper = createColumnHelper<AeropressBrewWithRelations>()

// Face columns: the coffee (with dialed-in crosshair), the Method Variant, a
// hero water:dose ratio, then the core aeropress stats. Grinder, device, days
// off roast and notes live in the expander (BrewDetails). AeroPress has no
// water temp, so there's no method-specific extra field.
const columns = [
  dialedInCoffeeColumn<AeropressBrewWithRelations>(),
  columnHelper.accessor('method.name', {
    header: 'Method',
    cell: (info) => info.getValue(),
  }),
  columnHelper.display({
    id: 'ratio',
    header: 'Ratio',
    // The hero metric — emphasised so it stands out against the muted stats.
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
    cell: (info) => (info.getValue() ? `${info.getValue()}s` : '-'),
  }),
  columnHelper.accessor('grindSetting', {
    header: 'Grind',
    cell: (info) => info.getValue() ?? '-',
  }),
  brewExpanderColumn<AeropressBrewWithRelations>(),
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
      renderDetails={(row) => (
        <BrewDetails
          grinder={row.original.grinder}
          device={row.original.brewingDevice}
          ratio={formatBrewRatio(row.original.dose, row.original.water)}
          daysOffRoast={daysOffRoast(
            row.original.roastDate,
            row.original.createdAt,
          )}
          notes={row.original.notes}
        />
      )}
      newTo="/aeropress/new"
      logLabel="Log Brew"
      emptyMessage="No aeropress brews yet."
      emptyLinkLabel="Log your first aeropress brew"
    />
  )
}
