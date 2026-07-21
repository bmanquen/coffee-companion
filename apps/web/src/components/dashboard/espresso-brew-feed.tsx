import { useSuspenseQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import type { EspressoShotWithRelations } from '@/types'
import {
  BrewDetails,
  brewExpanderColumn,
  dialedInCoffeeColumn,
} from '@/components/brews/brew-details'
import { BrewFeed } from '@/components/dashboard/brew-feed'
import { useTRPC } from '@/integrations/trpc/react'
import { daysOffRoast } from '@/lib/brew'
import { formatBrewRatio } from '@/lib/brew-ratio'

const columnHelper = createColumnHelper<EspressoShotWithRelations>()

// Face columns: the coffee (with dialed-in crosshair), a hero ratio, then the
// core espresso stats. Grinder, device, days off roast and notes live in the
// expander (BrewDetails).
const columns = [
  dialedInCoffeeColumn<EspressoShotWithRelations>(),
  columnHelper.display({
    id: 'ratio',
    header: 'Ratio',
    // The hero metric — emphasised so it reads first against the muted stats.
    cell: ({ row }) => (
      <span className="font-semibold text-foreground">
        {formatBrewRatio(row.original.dose, row.original.yield)}
      </span>
    ),
  }),
  columnHelper.accessor('dose', {
    header: 'Dose',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
  }),
  columnHelper.accessor('yield', {
    header: 'Yield',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
  }),
  columnHelper.accessor('time', {
    header: 'Time',
    cell: (info) => (info.getValue() ? `${info.getValue()}s` : '-'),
  }),
  columnHelper.accessor('grindSetting', {
    header: 'Grind',
    cell: (info) => info.getValue() ?? '-',
  }),
  brewExpanderColumn<EspressoShotWithRelations>(),
]

// The Espresso tab of the dashboard: the full espresso Shot history as a
// reference-only feed. Loads the method's getAll and hands it to BrewFeed.
export function EspressoBrewFeed() {
  const trpc = useTRPC()
  const { data: shots } = useSuspenseQuery(
    trpc.espressoShot.getAll.queryOptions(),
  )

  return (
    <BrewFeed
      title="Espresso"
      brews={shots}
      columns={columns}
      renderDetails={(row) => (
        <BrewDetails
          grinder={row.original.grinder}
          device={row.original.brewingDevice}
          ratio={formatBrewRatio(row.original.dose, row.original.yield)}
          daysOffRoast={daysOffRoast(row.original.roastDate, row.original.createdAt)}
          notes={row.original.notes}
        />
      )}
      newTo="/espresso/new"
      logLabel="Log Shot"
      emptyMessage="No espresso shots yet."
      emptyLinkLabel="Log your first shot"
    />
  )
}
