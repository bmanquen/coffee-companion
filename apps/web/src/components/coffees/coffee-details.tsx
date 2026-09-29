import type { ReactNode } from 'react'
import { DetailList } from '@/components/detail-list'

// The expandable detail region shared by the coffee card and the desktop table
// sub-row (see ADR-0003), revealed on expand. Holds the fields demoted out of a
// coffee's identity summary (name · roaster · country · region — a coffee's
// summary is identity, not a dial-in triangle, see ADR-0002): process, roast
// level, varieties, whether the coffee has a Dialed-in Brew, and notes. This is
// the coffee analogue of BrewDetails — a coffee is not a brew, so it owns its
// own fields; both render through the shared DetailList shell.
export function CoffeeDetails({
  process,
  roastLevel,
  varieties,
  dialedIn,
  notes,
}: {
  process: string | null
  roastLevel: string | null
  varieties: Array<string>
  dialedIn: ReactNode
  notes: string | null
}) {
  const rows: Array<{ label: string; value: ReactNode }> = [
    { label: 'Process', value: process || '-' },
    { label: 'Roast level', value: roastLevel || '-' },
    {
      label: 'Varieties',
      value: varieties.length > 0 ? varieties.join(', ') : '-',
    },
    { label: 'Dialed in', value: dialedIn },
  ]

  return <DetailList rows={rows} notes={notes} />
}
