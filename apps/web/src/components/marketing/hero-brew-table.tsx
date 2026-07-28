import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import type { EspressoShotWithRelations } from '@/types'
import { dialedInCoffeeColumn } from '@/components/brews/brew-details'
import { DataTable } from '@/components/data-table'
import { Card } from '@/components/ui/card'
import { sampleShots } from '@/components/marketing/sample-brews'

const columnHelper = createColumnHelper<EspressoShotWithRelations>()

// The same dial-in summary the Espresso feed shows (ADR-0002): the Coffee, then
// the levers you actually turn — grind, dose, yield, time. No expander column:
// a visitor is looking, not navigating, so there is nothing here to open.
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
]

// The hero's product shot — rendered from the app's own DataTable and Coffee
// column rather than a screenshot, so it cannot drift from what the Espresso
// feed actually looks like. Read-only: no expansion, no pagination, no filters,
// and nothing that links into routes a signed-out visitor can't reach.
export function HeroBrewTable() {
  // Mirrors DataTable's own opt-out: the table instance is stable and mutable,
  // and the React Compiler would over-memoize its row model.
  'use no memo'
  const table = useReactTable({
    data: sampleShots,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <Card className="overflow-hidden p-0">
      <DataTable
        table={table}
        rowClassName={(row) =>
          row.original.isDialedIn ? 'bg-primary/10' : undefined
        }
      />
    </Card>
  )
}
