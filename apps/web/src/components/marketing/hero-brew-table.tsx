import { getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { DataTable } from '@/components/data-table'
import { espressoSummaryColumns } from '@/components/dashboard/espresso-brew-feed'
import { sampleShots } from '@/components/marketing/sample-brews'
import { Card } from '@/components/ui/card'

// The hero's product shot — rendered from the app's own DataTable and the very
// columns the Espresso feed uses, rather than a screenshot, so it cannot drift
// from what the feed actually looks like. Read-only: the feed's expander column
// is left off, since a visitor is looking rather than navigating, and nothing
// here links into routes a signed-out visitor can't reach.
export function HeroBrewTable() {
  // Mirrors DataTable's own opt-out: the table instance is stable and mutable,
  // and the React Compiler would over-memoize its row model.
  'use no memo'
  const table = useReactTable({
    data: sampleShots,
    columns: espressoSummaryColumns,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: false,
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
