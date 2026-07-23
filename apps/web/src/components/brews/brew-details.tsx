import { createColumnHelper } from '@tanstack/react-table'
import { ChevronDown, Crosshair } from 'lucide-react'
import { cn } from '@/lib/utils'

// The expandable detail region shared by every dashboard brew card, revealed
// when a card is expanded. Holds the fields demoted out of the minimal
// summary: grinder, device, days off roast, notes, and the one method-specific
// `extra` slot (Water temp for pour over/french press, Environment for cold
// brew; espresso and aeropress omit it). The dial-in summary already carries
// grind, weights and time (see ADR-0002), so none of those repeat here.
// `daysOffRoast` undefined -> its row is hidden.
export function BrewDetails({
  grinder,
  device,
  extra,
  daysOffRoast,
  notes,
}: {
  grinder: { name: string; brand: string }
  device: { name: string; brand: string }
  extra?: { label: string; value: string }
  daysOffRoast?: number | null
  notes: string | null
}) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Grinder', value: `${grinder.name} (${grinder.brand})` },
    { label: 'Device', value: `${device.name} (${device.brand})` },
    ...(extra ? [{ label: extra.label, value: extra.value }] : []),
    ...(daysOffRoast !== undefined
      ? [
          {
            label: 'Days off roast',
            value: daysOffRoast != null ? `${daysOffRoast}d` : '-',
          },
        ]
      : []),
  ]

  // One field per row, labels aligned in a fixed-width column so values line up.
  return (
    <dl className="flex flex-col gap-1.5 text-sm text-left">
      {rows.map((row) => (
        <div key={row.label} className="flex gap-3">
          <dt className="w-32 shrink-0 text-muted-foreground">{row.label}</dt>
          <dd className="text-foreground">{row.value}</dd>
        </div>
      ))}
      <div className="flex gap-3">
        <dt className="w-32 shrink-0 text-muted-foreground">Notes</dt>
        <dd className="text-foreground">
          {notes ?? (
            <span className="text-muted-foreground/60">No notes...</span>
          )}
        </dd>
      </div>
    </dl>
  )
}

// The "Coffee" column shared by the recent dashboard cards, prefixing the coffee
// name with a dialed-in crosshair icon. (The dialed-in cards use a plain coffee
// column, since every row there is dialed in.)
export function dialedInCoffeeColumn<
  T extends { isDialedIn: boolean; coffee: { name: string } },
>() {
  return createColumnHelper<T>().accessor((row) => row.coffee.name, {
    id: 'coffee',
    header: 'Coffee',
    cell: (info) => (
      <span className="flex items-center gap-1.5">
        {info.row.original.isDialedIn && (
          <Crosshair
            aria-label="Dialed in"
            className="h-4 w-4 shrink-0 text-primary"
          />
        )}
        {info.getValue()}
      </span>
    ),
    meta: { cardTitle: true },
  })
}

// The chevron expander column shared by every dashboard brew card. Desktop uses
// this column; the mobile card renders its own toggle (hence cardHidden).
export function brewExpanderColumn<T>() {
  return createColumnHelper<T>().display({
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
    meta: { cardHidden: true },
  })
}
