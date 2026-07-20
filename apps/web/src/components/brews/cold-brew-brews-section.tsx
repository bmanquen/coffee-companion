import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { CellContext, SortingState } from '@tanstack/react-table'
import type { ColdBrewBrewWithRelations } from '@/types'
import { BrewsEmptyState } from '@/components/brews/brews-empty-state'
import { DeleteBrewDialog } from '@/components/brews/delete-brew-dialog'
import { DialedInToggleCell } from '@/components/brews/dialed-in-toggle-cell'
import { CoffeeFilter } from '@/components/coffee-filter'
import { DataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useTRPC } from '@/integrations/trpc/react'
import { daysOffRoast, formatSteepMinutes } from '@/lib/brew'
import { formatBrewRatio } from '@/lib/brew-ratio'

type Brew = ColdBrewBrewWithRelations

function DialedInCell({ row }: CellContext<Brew, unknown>) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const setDialedIn = useMutation(
    trpc.coldBrewBrew.setDialedIn.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.coldBrewBrew.getAll.queryOptions())
      },
    }),
  )

  const brew = row.original
  const dialedIn = brew.isDialedIn

  return (
    <DialedInToggleCell
      dialedIn={dialedIn}
      onLabel={`Dialed in ${brew.coffee.name} — clear`}
      offLabel={`Mark ${brew.coffee.name} as dialed in`}
      // Cold brew is methodless, so dialing in is scoped to the coffee alone.
      onToggle={() =>
        setDialedIn.mutate({
          coffeeId: brew.coffeeId,
          brewId: dialedIn ? null : brew.id,
        })
      }
    />
  )
}

function ActionsCell({ row }: CellContext<Brew, unknown>) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const deleteBrew = useMutation(
    trpc.coldBrewBrew.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.coldBrewBrew.getAll.queryOptions())
      },
    }),
  )

  const brew = row.original

  return (
    <div className="flex items-center justify-end gap-1">
      <Link to="/cold-brew/$brewId/edit" params={{ brewId: brew.id }}>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Edit brew"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </Link>
      <DeleteBrewDialog
        noun="brew"
        coffeeName={brew.coffee.name}
        isPending={deleteBrew.isPending}
        onDelete={() => deleteBrew.mutate(brew.id)}
      />
    </div>
  )
}

const columnHelper = createColumnHelper<Brew>()

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
  }),
  columnHelper.accessor('water', {
    header: 'Water',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
    sortingFn: (a, b) =>
      Number(a.original.water ?? 0) - Number(b.original.water ?? 0),
  }),
  columnHelper.display({
    id: 'ratio',
    header: 'Ratio',
    cell: ({ row }) => formatBrewRatio(row.original.dose, row.original.water),
    // Display columns aren't sortable in TanStack, so no sortingFn here.
  }),
  columnHelper.accessor('steepTime', {
    header: 'Steep',
    cell: (info) => formatSteepMinutes(info.getValue()),
  }),
  columnHelper.accessor('brewEnvironment', {
    header: 'Environment',
    // Optional categorical field: render blank (not "-") when unset.
    cell: (info) => info.getValue() ?? '',
  }),
  columnHelper.accessor('grinder.name', {
    header: 'Grinder',
  }),
  columnHelper.accessor('grindSetting', {
    header: 'Grind',
    cell: (info) => info.getValue() ?? '-',
  }),
  columnHelper.accessor('notes', {
    header: 'Notes',
    // Free text: render blank (not "-") when there are no notes.
    cell: (info) =>
      info.getValue() ? (
        <span className="block whitespace-pre-wrap break-words lg:mx-auto lg:max-w-[16rem]">
          {info.getValue()}
        </span>
      ) : null,
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

// The Cold Brew log — one tab of the /brews page. Mirrors the other brew
// sections: a per-coffee dialed-in toggle, the recipe columns, and per-row
// edit/delete actions.
export function ColdBrewBrewsSection() {
  'use no memo'
  const trpc = useTRPC()
  const { data: brews } = useSuspenseQuery(
    trpc.coldBrewBrew.getAll.queryOptions(),
  )

  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [coffeeId, setCoffeeId] = useState('')

  // Unique coffees that actually appear in the log, sorted by name.
  const coffeeOptions = useMemo(
    () =>
      Array.from(
        new Map(brews.map((b) => [b.coffeeId, b.coffee.name])).entries(),
      )
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [brews],
  )

  // Memoized so the filtered array keeps a stable reference between renders
  // (a fresh array each render trips the table's autoReset into a render loop).
  const visibleBrews = useMemo(
    () => (coffeeId ? brews.filter((b) => b.coffeeId === coffeeId) : brews),
    [brews, coffeeId],
  )

  const table = useReactTable({
    data: visibleBrews,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <Card className="flex flex-col gap-4 w-full bg-white p-6">
      <div className="flex justify-between items-center w-full">
        <h2 className="text-lg font-semibold">Cold Brew</h2>
        <Link to="/cold-brew/new">
          <Button>
            <Plus />
            Log Brew
          </Button>
        </Link>
      </div>
      {brews.length === 0 ? (
        <BrewsEmptyState
          message="No cold brews yet."
          to="/cold-brew/new"
          linkLabel="Log your first brew"
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
              placeholder="Filter brews..."
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
