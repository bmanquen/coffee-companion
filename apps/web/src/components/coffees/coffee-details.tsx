import type { ReactNode } from 'react'
import { DetailList } from '@/components/detail-list'

// The expandable detail region shared by the coffee card and the desktop table
// sub-row (see ADR-0003), revealed on expand. Holds the fields demoted out of a
// coffee's identity summary (name · roaster · country · region — a coffee's
// summary is identity, not a dial-in triangle, see ADR-0002): process, roast
// level, varieties, the dialed-in espresso recipe, and notes. This is the coffee
// analogue of BrewDetails — a coffee is not a brew, so it owns its own fields;
// both render through the shared DetailList shell.
export function CoffeeDetails({
  process,
  roastLevel,
  varieties,
  dialedInEspresso,
  notes,
}: {
  process: string | null
  roastLevel: string | null
  varieties: Array<string>
  // The dialed-in espresso recipe, pre-compacted to a single line ('-' if none)
  // — or the Sealed notice, when the shot it came from is not readable.
  dialedInEspresso: ReactNode
  notes: string | null
}) {
  const rows: Array<{ label: string; value: ReactNode }> = [
    { label: 'Process', value: process || '-' },
    { label: 'Roast level', value: roastLevel || '-' },
    {
      label: 'Varieties',
      value: varieties.length > 0 ? varieties.join(', ') : '-',
    },
    { label: 'Dialed-in espresso', value: dialedInEspresso },
  ]

  return <DetailList rows={rows} notes={notes} />
}
