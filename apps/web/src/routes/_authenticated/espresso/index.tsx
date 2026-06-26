import { DataTable } from '@/components/data-table'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { useTRPC } from '@/integrations/trpc/react'
import { brewRatio, formatBrewRatio, isDialedIn } from '@/lib/brew-ratio'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type CellContext,
  type SortingState,
} from '@tanstack/react-table'
import { CoffeeIcon, Crosshair, Plus } from 'lucide-react'
import { useState } from 'react'

export const Route = createFileRoute('/_authenticated/espresso/')({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(
      context.trpc.espressoShot.getAll.queryOptions(),
    )
  },
  component: EspressoIndex,
})

type Shot = {
  id: string
  coffeeId: string
  dose: string | null
  yield: string | null
  time: number | null
  grindSetting: string | null
  notes: string | null
  coffee: { name: string; dialedInShotId: string | null }
  grinder: { name: string; brand: string }
  brewingDevice: { name: string; brand: string; type: { name: string } }
}

const columnHelper = createColumnHelper<Shot>()

function DialedInCell({ row }: CellContext<Shot, unknown>) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const setDialedIn = useMutation(
    trpc.coffee.setDialedIn.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.espressoShot.getAll.queryOptions())
        queryClient.invalidateQueries(trpc.coffee.getAll.queryOptions())
      },
    }),
  )

  const shot = row.original
  const dialedIn = isDialedIn(shot)

  return (
    <Button
      variant={dialedIn ? 'default' : 'ghost'}
      size="icon"
      className="h-8 w-8"
      onClick={() =>
        setDialedIn.mutate({
          coffeeId: shot.coffeeId,
          shotId: dialedIn ? null : shot.id,
        })
      }
    >
      <Crosshair className="h-4 w-4" />
    </Button>
  )
}

const columns = [
  columnHelper.accessor('coffee.name', {
    header: 'Coffee',
  }),
  columnHelper.accessor('dose', {
    header: 'Dose',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
    sortingFn: (a, b) =>
      Number(a.original.dose ?? 0) - Number(b.original.dose ?? 0),
  }),
  columnHelper.accessor('yield', {
    header: 'Yield',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
    sortingFn: (a, b) =>
      Number(a.original.yield ?? 0) - Number(b.original.yield ?? 0),
  }),
  columnHelper.display({
    id: 'ratio',
    header: 'Ratio',
    cell: ({ row }) => formatBrewRatio(row.original.dose, row.original.yield),
    sortingFn: (a, b) => {
      const ratioA = brewRatio(a.original.dose, a.original.yield) ?? 0
      const ratioB = brewRatio(b.original.dose, b.original.yield) ?? 0
      return ratioA - ratioB
    },
  }),
  columnHelper.accessor('time', {
    header: 'Time',
    cell: (info) => (info.getValue() ? `${info.getValue()}s` : '-'),
  }),
  columnHelper.accessor('grinder.name', {
    header: 'Grinder',
  }),
  columnHelper.accessor('brewingDevice.name', {
    header: 'Device',
  }),
  columnHelper.accessor('grindSetting', {
    header: 'Grind',
    cell: (info) => info.getValue() ?? '-',
  }),
  columnHelper.accessor('notes', {
    header: 'Notes',
    cell: (info) => info.getValue() ?? '-',
    enableSorting: false,
  }),
  columnHelper.display({
    id: 'dialedIn',
    header: '',
    cell: DialedInCell,
    enableSorting: false,
  }),
]

function EspressoIndex() {
  'use no memo'
  const trpc = useTRPC()
  const { data: shots } = useSuspenseQuery(
    trpc.espressoShot.getAll.queryOptions(),
  )

  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const table = useReactTable({
    data: shots as Shot[],
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  if (shots.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CoffeeIcon />
          </EmptyMedia>
          <EmptyTitle>No Espresso Shots Yet</EmptyTitle>
          <EmptyDescription>
            Start dialing in your espresso by logging your first shot.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link to="/espresso/new">
            <Button>
              <Plus />
              Log Shot
            </Button>
          </Link>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col items-center p-4 gap-4">
      <div className="flex justify-between items-center w-full">
        <H1>Espresso</H1>
        <Link to="/espresso/new">
          <Button>
            <Plus />
            Log Shot
          </Button>
        </Link>
      </div>
      <Input
        placeholder="Filter shots..."
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        className="w-full"
      />
      <div className="w-full">
        <DataTable table={table} />
      </div>
    </div>
  )
}
