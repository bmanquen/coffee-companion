import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useState } from 'react'
import { Card } from './ui/card'
import { useTRPC } from '@/integrations/trpc/react'
import { Button } from '@/components/ui/button'
import { PaginationControls } from '@/components/pagination-controls'
import { DataTable } from '@/components/data-table'

const PAGE_SIZE = 5

type Coffee = {
  id: string
  name: string
  notes: string | null
}

const columnHelper = createColumnHelper<Coffee>()

const columns = [
  columnHelper.accessor('name', { header: 'Name', meta: { cardTitle: true } }),
  columnHelper.accessor('notes', {
    header: 'Notes',
    cell: (info) => info.getValue() ?? '-',
  }),
]

export function RecentCoffees() {
  const trpc = useTRPC()
  const [page, setPage] = useState(0)

  const { data } = useSuspenseQuery(
    trpc.coffee.getRecent.queryOptions({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
  )

  const totalPages = Math.ceil(data.total / PAGE_SIZE)

  const table = useReactTable({
    data: data.items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: false,
  })

  return (
    <Card className="flex flex-row items-center gap-4 p-4">
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        <div className="flex justify-between">
          <h2 className="text-lg font-semibold">Recent Coffees</h2>
          <Link to="/coffees/new">
            <Button variant="outline" size="sm">
              Add Coffee
            </Button>
          </Link>
        </div>
        {data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No coffees yet.{' '}
            <Link to="/coffees/new" className="underline">
              Add your first coffee
            </Link>
            .
          </p>
        ) : (
          <>
            <DataTable table={table} />
            <PaginationControls
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </Card>
  )
}
