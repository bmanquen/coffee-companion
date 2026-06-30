import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { CoffeeIcon, Crosshair, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { CellContext, SortingState } from '@tanstack/react-table'
import { CoffeeFilter } from '@/components/coffee-filter'
import { DataTable } from '@/components/data-table'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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

function ActionsCell({ row }: CellContext<Shot, unknown>) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const deleteShot = useMutation(
    trpc.espressoShot.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.espressoShot.getAll.queryOptions())
        queryClient.invalidateQueries(trpc.coffee.getAll.queryOptions())
      },
    }),
  )

  const shot = row.original

  return (
    <div className="flex items-center justify-end gap-1">
      <Link to="/espresso/$shotId/edit" params={{ shotId: shot.id }}>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Edit shot"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </Link>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Delete shot"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete shot</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this shot for &quot;
              {shot.coffee.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <DialogClose asChild>
              <Button
                variant="destructive"
                disabled={deleteShot.isPending}
                onClick={() => deleteShot.mutate(shot.id)}
              >
                Delete
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
  columnHelper.display({
    id: 'actions',
    header: '',
    cell: ActionsCell,
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
  const [coffeeId, setCoffeeId] = useState('')

  // Unique coffees that actually appear in the log, sorted by name.
  const coffeeOptions = useMemo(
    () =>
      Array.from(
        new Map(shots.map((s) => [s.coffeeId, s.coffee.name])).entries(),
      )
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [shots],
  )

  // Memoized so the filtered array keeps a stable reference between renders.
  // Passing a fresh array to the table on every render trips its default
  // autoReset* state updates and spins into an infinite render loop.
  const visibleShots = useMemo(
    () => (coffeeId ? shots.filter((s) => s.coffeeId === coffeeId) : shots),
    [shots, coffeeId],
  )

  const table = useReactTable({
    data: visibleShots,
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
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <CoffeeFilter
          options={coffeeOptions}
          value={coffeeId}
          onChange={setCoffeeId}
        />
        <Input
          placeholder="Filter shots..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="flex-1"
        />
      </div>
      <div className="w-full">
        <DataTable table={table} />
      </div>
    </div>
  )
}
