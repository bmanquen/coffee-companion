import { useSuspenseQuery } from '@tanstack/react-query'
import {
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Card } from './ui/card'
import {
  ColdBrewDetails,
  coldBrewColumnHelper,
  coldBrewExpanderColumn,
  coldBrewSummaryColumns,
} from './cold-brew-summary'
import type { ColdBrewBrewWithRelations } from '@/types'
import { DataTable } from '@/components/data-table'
import { useTRPC } from '@/integrations/trpc/react'

export const MAX_BREWS = 10

const columns = [
  coldBrewColumnHelper.accessor('coffee.name', {
    header: 'Coffee',
    meta: { cardTitle: true },
  }),
  ...coldBrewSummaryColumns,
  coldBrewExpanderColumn,
]

// The coffee's dialed-in cold brews on the dashboard. Cold brew is methodless
// (ADR-0001), so there is at most one dialed-in cold brew per coffee — no method
// column, unlike the other immersion methods.
export function DialedInColdBrewBrews() {
  const trpc = useTRPC()

  const { data } = useSuspenseQuery(
    trpc.coldBrewBrew.getDialedIn.queryOptions({ limit: MAX_BREWS }),
  )

  const table = useReactTable<ColdBrewBrewWithRelations>({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    enableSorting: false,
  })

  // Nothing dialed in yet — keep the dashboard uncluttered.
  if (data.length === 0) return null

  return (
    <Card className="flex flex-row items-center gap-4 p-4">
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        <h2 className="text-lg font-semibold">Dialed In Cold Brew</h2>
        <DataTable
          table={table}
          renderSubComponent={(row) => <ColdBrewDetails row={row} />}
        />
      </div>
    </Card>
  )
}
