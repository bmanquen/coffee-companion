import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  createColumnHelper,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { CellContext, SortingState } from '@tanstack/react-table'
import { brewRatioColumn } from '@/components/brews/brew-details'
import { BrewNotes } from '@/components/brews/brew-notes'
import { BrewsEmptyState } from '@/components/brews/brews-empty-state'
import { DeleteBrewDialog } from '@/components/brews/delete-brew-dialog'
import { DialedInToggleCell } from '@/components/brews/dialed-in-toggle-cell'
import { CoffeeFilter } from '@/components/coffee-filter'
import { DataTable } from '@/components/data-table'
import { useAccordionExpansion } from '@/hooks/use-accordion-expansion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useTRPC } from '@/integrations/trpc/react'
import { daysOffRoast } from '@/lib/brew'
import { formatBrewRatio } from '@/lib/brew-ratio'

type Shot = {
  id: string
  coffeeId: string
  isDialedIn: boolean
  roastDate: string | null
  createdAt: Date
  dose: string | null
  yield: string | null
  time: number | null
  grindSetting: string | null
  notes: string | null
  coffee: { name: string }
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
  const dialedIn = shot.isDialedIn

  return (
    <DialedInToggleCell
      dialedIn={dialedIn}
      onLabel={`Dialed in ${shot.coffee.name} — clear`}
      offLabel={`Mark ${shot.coffee.name} as dialed in`}
      onToggle={() =>
        setDialedIn.mutate({
          coffeeId: shot.coffeeId,
          shotId: dialedIn ? null : shot.id,
        })
      }
    />
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
      <DeleteBrewDialog
        noun="shot"
        coffeeName={shot.coffee.name}
        isPending={deleteShot.isPending}
        onDelete={() => deleteShot.mutate(shot.id)}
      />
    </div>
  )
}

const columns = [
  columnHelper.display({
    id: 'dialedIn',
    header: '',
    cell: DialedInCell,
    enableSorting: false,
    meta: { cardHideLabel: true },
  }),
  columnHelper.accessor('coffee.name', {
    header: 'Coffee',
    meta: { cardTitle: true },
  }),
  columnHelper.accessor((row) => daysOffRoast(row.roastDate, row.createdAt), {
    id: 'daysOffRoast',
    header: 'Days off roast',
    cell: (info) => (info.getValue() != null ? `${info.getValue()}d` : '-'),
    sortingFn: (a, b) =>
      (daysOffRoast(a.original.roastDate, a.original.createdAt) ?? -1) -
      (daysOffRoast(b.original.roastDate, b.original.createdAt) ?? -1),
  }),
  columnHelper.accessor('dose', {
    header: 'Dose',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
    sortingFn: (a, b) =>
      Number(a.original.dose ?? 0) - Number(b.original.dose ?? 0),
    meta: { cardSummary: true },
  }),
  columnHelper.accessor('yield', {
    header: 'Yield',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
    sortingFn: (a, b) =>
      Number(a.original.yield ?? 0) - Number(b.original.yield ?? 0),
    meta: { cardSummary: true },
  }),
  brewRatioColumn<Shot>((row) => formatBrewRatio(row.dose, row.yield)),
  columnHelper.accessor('time', {
    header: 'Time',
    cell: (info) => (info.getValue() ? `${info.getValue()}s` : '-'),
    meta: { cardSummary: true },
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
    meta: { cardSummary: true, cardSummaryLabel: true },
  }),
  columnHelper.accessor('notes', {
    header: 'Notes',
    cell: (info) => <BrewNotes notes={info.getValue()} />,
    enableSorting: false,
    meta: { cardFullWidth: true },
  }),
  columnHelper.display({
    id: 'actions',
    header: '',
    cell: ActionsCell,
    enableSorting: false,
    meta: { cardHideLabel: true },
  }),
]

// The Espresso brew log — one tab of the /brews page. Mirrors the equipment
// page's section components (heading + add button + filters + table).
export function EspressoBrewsSection() {
  'use no memo'
  const trpc = useTRPC()
  const { data: shots } = useSuspenseQuery(
    trpc.espressoShot.getAll.queryOptions(),
  )

  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [coffeeId, setCoffeeId] = useState('')
  const expansion = useAccordionExpansion()

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
    // Mobile cards collapse to a dial-in summary; expansion (accordion) reveals
    // grinder, device, days off roast and notes. Desktop shows them as columns.
    state: { sorting, globalFilter, expanded: expansion.expanded },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onExpandedChange: expansion.onExpandedChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
  })

  return (
    <Card className="flex flex-col gap-4 w-full bg-white p-6">
      <div className="flex justify-between items-center w-full">
        <h2 className="text-lg font-semibold">Espresso</h2>
        <Link to="/espresso/new">
          <Button>
            <Plus />
            Log Shot
          </Button>
        </Link>
      </div>
      {shots.length === 0 ? (
        <BrewsEmptyState
          message="No espresso shots yet."
          to="/espresso/new"
          linkLabel="Log your first shot"
        />
      ) : (
        <>
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
          <DataTable
            table={table}
            rowClassName={(row) =>
              row.original.isDialedIn
                ? 'bg-primary/10 hover:bg-primary/15'
                : undefined
            }
          />
        </>
      )}
    </Card>
  )
}
