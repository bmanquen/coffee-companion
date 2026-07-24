// The expandable detail region shared by the coffee card and the desktop table
// sub-row (see ADR-0003), revealed on expand. Holds the fields demoted out of a
// coffee's identity summary (name · roaster · country · region — a coffee's
// summary is identity, not a dial-in triangle, see ADR-0002): process, roast
// level, varieties, the dialed-in espresso recipe, and notes. This is the coffee
// analogue of BrewDetails — a coffee is not a brew, so it has its own fields.
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
  // The dialed-in espresso recipe, pre-compacted to a single line ('-' if none).
  dialedInEspresso: string
  notes: string | null
}) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Process', value: process || '-' },
    { label: 'Roast level', value: roastLevel || '-' },
    {
      label: 'Varieties',
      value: varieties.length > 0 ? varieties.join(', ') : '-',
    },
    { label: 'Dialed-in espresso', value: dialedInEspresso },
  ]

  // Labels aligned in a fixed-width column so values line up. One field per row
  // on the mobile card; two per row on the wider desktop-table sub-row (lg).
  // Notes always spans the full width. Mirrors BrewDetails' layout.
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm text-left lg:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="flex gap-3">
          <dt className="w-32 shrink-0 text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 text-foreground">{row.value}</dd>
        </div>
      ))}
      <div className="flex gap-3 lg:col-span-2">
        <dt className="w-32 shrink-0 text-muted-foreground">Notes</dt>
        <dd className="min-w-0 text-foreground whitespace-pre-wrap break-words">
          {notes ?? (
            <span className="text-muted-foreground/60">No notes...</span>
          )}
        </dd>
      </div>
    </dl>
  )
}
