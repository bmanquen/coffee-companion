import { DataTable } from '@/components/data-table'
import { PaginationControls } from '@/components/pagination-controls'
import { Button } from '@/components/ui/button'
import { useTRPC } from '@/integrations/trpc/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useState } from 'react'
import { Card } from './ui/card'

const PAGE_SIZE = 5

type EspressoShot = {
  id: string
  dose: string | null
  yield: string | null
  time: number | null
  grindSetting: string | null
  coffee: { name: string }
}

const columnHelper = createColumnHelper<EspressoShot>()

const columns = [
  columnHelper.accessor('coffee.name', { header: 'Coffee' }),
  columnHelper.accessor('dose', {
    header: 'Dose',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
  }),
  columnHelper.accessor('yield', {
    header: 'Yield',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
  }),
  columnHelper.accessor('time', {
    header: 'Time',
    cell: (info) => (info.getValue() ? `${info.getValue()}s` : '-'),
  }),
  columnHelper.accessor('grindSetting', {
    header: 'Grind',
    cell: (info) => info.getValue() ?? '-',
  }),
]

export function RecentEspressoShots() {
  const trpc = useTRPC()
  const [page, setPage] = useState(0)

  const { data } = useSuspenseQuery(
    trpc.espressoShot.getRecent.queryOptions({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
  )

  const totalPages = Math.ceil(data.total / PAGE_SIZE)

  const table = useReactTable<EspressoShot>({
    data: data.items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <Card className="flex flex-row items-center gap-4 p-4">
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        <div className="flex justify-between">
          <h2 className="text-lg font-semibold">Recent Espresso Shots</h2>
          <Link to="/espresso/new">
            <Button variant="outline" size="sm">
              Log Shot
            </Button>
          </Link>
        </div>
        {data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No espresso shots yet.{' '}
            <Link to="/espresso/new" className="underline">
              Log your first shot
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
      {data.items.length === 0 && (
        <Link to="/espresso/new">
          <Button variant="outline" size="sm">
            Log Shot
          </Button>
        </Link>
      )}
    </Card>
  )
}
