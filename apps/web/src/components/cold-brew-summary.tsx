import { createColumnHelper } from '@tanstack/react-table'
import { ChevronDown } from 'lucide-react'
import type { Row } from '@tanstack/react-table'
import type { ColdBrewBrewWithRelations } from '@/types'
import { daysOffRoast, formatSteepMinutes } from '@/lib/brew'
import { formatBrewRatio } from '@/lib/brew-ratio'
import { cn } from '@/lib/utils'

// Shared table pieces for the two dashboard cold-brew cards — the dialed-in card
// and the recent-brews card. Both render the same recipe columns and the same
// expandable detail; only the Coffee column differs (the recent card prepends a
// dialed-in icon), so each card supplies its own Coffee column around these.
export const coldBrewColumnHelper =
  createColumnHelper<ColdBrewBrewWithRelations>()

export const coldBrewSummaryColumns = [
  coldBrewColumnHelper.accessor(
    (row) => daysOffRoast(row.roastDate, row.createdAt),
    {
      id: 'daysOffRoast',
      header: 'Days off roast',
      cell: (info) => (info.getValue() != null ? `${info.getValue()}d` : '-'),
    },
  ),
  coldBrewColumnHelper.accessor('dose', {
    header: 'Dose',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
  }),
  coldBrewColumnHelper.accessor('water', {
    header: 'Water',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
  }),
  coldBrewColumnHelper.accessor('steepTime', {
    header: 'Steep',
    cell: (info) => formatSteepMinutes(info.getValue()),
  }),
  coldBrewColumnHelper.accessor('grindSetting', {
    header: 'Grind',
    cell: (info) => info.getValue() ?? '-',
  }),
]

export const coldBrewExpanderColumn = coldBrewColumnHelper.display({
  id: 'expander',
  header: '',
  cell: ({ row }) => (
    <ChevronDown
      className={cn(
        'h-4 w-4 text-muted-foreground transition-transform',
        row.getIsExpanded() && 'rotate-180',
      )}
    />
  ),
  // Desktop uses this chevron column; the mobile card renders its own.
  meta: { cardHidden: true },
})

export function ColdBrewDetails({
  row,
}: {
  row: Row<ColdBrewBrewWithRelations>
}) {
  const brew = row.original
  return (
    <dl className="mx-auto grid max-w-2xl grid-cols-1 gap-x-8 gap-y-2 text-sm py-1 text-left sm:grid-cols-2">
      <div>
        <dt className="inline font-medium">Grinder: </dt>
        <dd className="inline text-muted-foreground">
          {brew.grinder.name} ({brew.grinder.brand})
        </dd>
      </div>
      <div>
        <dt className="inline font-medium">Device: </dt>
        <dd className="inline text-muted-foreground">
          {brew.brewingDevice.name} ({brew.brewingDevice.brand})
        </dd>
      </div>
      <div>
        <dt className="inline font-medium">Ratio: </dt>
        <dd className="inline text-muted-foreground">
          {formatBrewRatio(brew.dose, brew.water)}
        </dd>
      </div>
      <div>
        <dt className="inline font-medium">Environment: </dt>
        <dd className="inline text-muted-foreground">
          {brew.brewEnvironment ?? '-'}
        </dd>
      </div>
      <div className="col-span-2">
        <dt className="inline font-medium">Notes: </dt>
        <dd className="inline text-muted-foreground">{brew.notes ?? '-'}</dd>
      </div>
    </dl>
  )
}
