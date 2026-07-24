// The label/value detail grid shared by the entity detail components
// (BrewDetails, CoffeeDetails), rendered inside a card's expander or a desktop
// table sub-row (see ADR-0003). Labels align in a fixed-width column so values
// line up: one field per row on the mobile card, two per row on the wider
// desktop-table sub-row (lg). Notes always spans the full width, with a dimmed
// placeholder when empty. Each entity owns its own field mapping; this owns only
// the presentation shell.
export function DetailList({
  rows,
  notes,
}: {
  rows: Array<{ label: string; value: string }>
  notes: string | null
}) {
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
