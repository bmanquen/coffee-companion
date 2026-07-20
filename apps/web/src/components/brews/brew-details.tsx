import { createColumnHelper } from '@tanstack/react-table'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// The expandable detail sub-row shared by every dashboard brew card (the
// dialed-in and recent cards for all five methods). The common fields —
// grinder, device, ratio, notes — are always shown; `extra` is the one
// method-specific slot (Water temp for pour over/french press, Environment for
// cold brew; espresso and aeropress omit it).
export function BrewDetails({
  grinder,
  device,
  ratio,
  extra,
  notes,
}: {
  grinder: { name: string; brand: string }
  device: { name: string; brand: string }
  ratio: string
  extra?: { label: string; value: string }
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
      <div>
        <dt className="inline font-medium">Ratio: </dt>
        <dd className="inline text-muted-foreground">{ratio}</dd>
      </div>
      {extra && (
        <div>
          <dt className="inline font-medium">{extra.label}: </dt>
          <dd className="inline text-muted-foreground">{extra.value}</dd>
        </div>
      )}
      <div className="col-span-2">
        <dt className="inline font-medium">Notes: </dt>
        <dd className="inline text-muted-foreground">{notes ?? '-'}</dd>
      </div>
    </dl>
  )
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
