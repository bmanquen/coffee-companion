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

const columnHelper = createColumnHelper<EspressoShotWithRelations>()

// The dial-in summary (see ADR-0002): coffee identity, then the levers you turn
// dialing in espresso — grind, real weights (dose→yield), and time. Grinder,
// device, days off roast and notes live in the expander
// (BrewDetails). On desktop these are scannable columns; on mobile they collapse
// into the card's summary line, everything else revealed on expand.
const columns = [
  dialedInCoffeeColumn<EspressoShotWithRelations>(),
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
  columnHelper.accessor('yield', {
    header: 'Yield',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
    meta: { cardSummary: true, cardSummaryLabel: true },
  }),
  columnHelper.accessor('time', {
    header: 'Time',
    cell: (info) => (info.getValue() ? `${info.getValue()}s` : '-'),
    meta: { cardSummary: true, cardSummaryLabel: true },
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
