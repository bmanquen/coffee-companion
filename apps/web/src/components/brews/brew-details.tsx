import { createColumnHelper } from '@tanstack/react-table'
import { ChevronDown, Crosshair } from 'lucide-react'
import { cn } from '@/lib/utils'

// The expandable detail region shared by every dashboard brew card, revealed
// when a card is expanded. Holds the fields demoted out of the minimal
// summary: grinder, device, days off roast, notes, and the one method-specific
// `extra` slot (Water temp for pour over/french press, Environment for cold
// brew; espresso and aeropress omit it). The dial-in summary already carries
// grind, weights, time and a muted ratio hint (see ADR-0002), so none of those
// repeat here. `daysOffRoast` undefined -> its row is hidden.
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
  return (
    <dl className="mx-auto grid max-w-2xl grid-cols-1 gap-x-8 gap-y-2 text-sm py-1 text-left sm:grid-cols-2">
      <div>
        <dt className="inline font-medium">Grinder: </dt>
        <dd className="inline text-muted-foreground">
          {grinder.name} ({grinder.brand})
        </dd>
      </div>
      <div>
        <dt className="inline font-medium">Device: </dt>
        <dd className="inline text-muted-foreground">
          {device.name} ({device.brand})
        </dd>
      </div>
      {extra && (
        <div>
          <dt className="inline font-medium">{extra.label}: </dt>
          <dd className="inline text-muted-foreground">{extra.value}</dd>
        </div>
      )}
      {daysOffRoast !== undefined && (
        <div>
          <dt className="inline font-medium">Days off roast: </dt>
          <dd className="inline text-muted-foreground">
            {daysOffRoast != null ? `${daysOffRoast}d` : '-'}
          </dd>
        </div>
      )}
      <div className="col-span-2">
        <dt className="inline font-medium">Notes: </dt>
        <dd className="inline text-muted-foreground">
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

// The muted ratio hint shared by every brew card's dial-in summary. Real
// weights (dose→yield/water) lead the summary; the ratio rides along
// de-emphasised for people who think in ratios (see ADR-0002). Rendered as a
// summary cell with no label — a "1:2.1" is self-evident.
export function brewRatioColumn<T>(getRatio: (row: T) => string) {
  return createColumnHelper<T>().display({
    id: 'ratio',
    header: 'Ratio',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{getRatio(row.original)}</span>
    ),
    meta: { cardSummary: true },
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
