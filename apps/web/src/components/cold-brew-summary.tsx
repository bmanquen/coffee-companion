import { createColumnHelper } from '@tanstack/react-table'
import type { Row } from '@tanstack/react-table'
import type { ColdBrewBrewWithRelations } from '@/types'
import {
  BrewDetails,
  brewExpanderColumn,
} from '@/components/brews/brew-details'
import { daysOffRoast, formatSteepMinutes } from '@/lib/brew'
import { formatBrewRatio } from '@/lib/brew-ratio'

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

export const coldBrewExpanderColumn =
  brewExpanderColumn<ColdBrewBrewWithRelations>()

// Cold brew's detail sub-row: the shared BrewDetails with the Environment slot
// (in place of the hot methods' water temperature).
export function ColdBrewDetails({
  row,
}: {
  row: Row<ColdBrewBrewWithRelations>
}) {
  const brew = row.original
  return (
    <BrewDetails
      grinder={brew.grinder}
      device={brew.brewingDevice}
      ratio={formatBrewRatio(brew.dose, brew.water)}
      extra={{ label: 'Environment', value: brew.brewEnvironment ?? '-' }}
      notes={brew.notes}
    />
  )
}
