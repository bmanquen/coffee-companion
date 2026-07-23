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
import type { FrenchpressBrewWithRelations } from '@/types'
import { brewRatioColumn } from '@/components/brews/brew-details'
import { BrewNotes } from '@/components/brews/brew-notes'
import { BrewsEmptyState } from '@/components/brews/brews-empty-state'
import { DeleteBrewDialog } from '@/components/brews/delete-brew-dialog'
import { DialedInToggleCell } from '@/components/brews/dialed-in-toggle-cell'
import { CoffeeFilter } from '@/components/coffee-filter'
import { DataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAccordionExpansion } from '@/hooks/use-accordion-expansion'
import { useTRPC } from '@/integrations/trpc/react'
import { daysOffRoast } from '@/lib/brew'
import { formatBrewRatio } from '@/lib/brew-ratio'

type Brew = FrenchpressBrewWithRelations

const columnHelper = createColumnHelper<Brew>()

function DialedInCell({ row }: CellContext<Brew, unknown>) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const setDialedIn = useMutation(
    trpc.frenchpressBrew.setDialedIn.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.frenchpressBrew.getAll.queryOptions(),
        )
      },
    }),
  )

  const brew = row.original
  const dialedIn = brew.isDialedIn

  return (
    <DialedInToggleCell
      dialedIn={dialedIn}
      onLabel={`Dialed in ${brew.coffee.name} for ${brew.method.name} — clear`}
      offLabel={`Mark ${brew.coffee.name} as dialed in for ${brew.method.name}`}
      // Dialing in is scoped per method: this only replaces the coffee's
      // dialed-in brew for *this* brew's method.
      onToggle={() =>
        setDialedIn.mutate({
          coffeeId: brew.coffeeId,
          methodId: brew.methodId,
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
    trpc.frenchpressBrew.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.frenchpressBrew.getAll.queryOptions(),
        )
      },
    }),
  )

  const brew = row.original

  return (
    <div className="flex items-center justify-end gap-1">
      <Link to="/frenchpress/$brewId/edit" params={{ brewId: brew.id }}>
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
  columnHelper.accessor('method.name', {
    header: 'Method',
    meta: { cardSummary: true },
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
  columnHelper.accessor('water', {
    header: 'Water',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
    sortingFn: (a, b) =>
      Number(a.original.water ?? 0) - Number(b.original.water ?? 0),
    meta: { cardSummary: true },
  }),
  brewRatioColumn<Brew>((row) => formatBrewRatio(row.dose, row.water)),
  columnHelper.accessor('steepTime', {
    header: 'Steep',
    cell: (info) => (info.getValue() ? `${info.getValue()}s` : '-'),
    meta: { cardSummary: true },
  }),
  columnHelper.accessor('waterTemp', {
    header: 'Temp',
    cell: (info) => (info.getValue() ? `${info.getValue()}°C` : '-'),
  }),
  columnHelper.accessor('grinder.name', {
    header: 'Grinder',
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

// The French Press brew log — one tab of the /brews page. Mirrors the equipment
// page's section components (heading + add button + filters + table).
export function FrenchpressBrewsSection() {
  'use no memo'
  const trpc = useTRPC()
  const { data: brews } = useSuspenseQuery(
    trpc.frenchpressBrew.getAll.queryOptions(),
  )

  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [coffeeId, setCoffeeId] = useState('')
  const expansion = useAccordionExpansion()

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
        <h2 className="text-lg font-semibold">French Press</h2>
        <Link to="/frenchpress/new">
          <Button>
            <Plus />
            Log Brew
          </Button>
        </Link>
      </div>
      {brews.length === 0 ? (
        <BrewsEmptyState
          message="No french press brews yet."
          to="/frenchpress/new"
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
