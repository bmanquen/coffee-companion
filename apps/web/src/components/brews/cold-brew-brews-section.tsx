import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { SortingState } from '@tanstack/react-table'
import type { ColdBrewBrewWithRelations } from '@/types'
import { CoffeeFilter } from '@/components/coffee-filter'
import { DataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useTRPC } from '@/integrations/trpc/react'
import { daysOffRoast } from '@/lib/brew'
import { formatBrewRatio } from '@/lib/brew-ratio'

type Brew = ColdBrewBrewWithRelations

// Cold brew steeps for hours, stored as whole minutes. Render it the way it's
// entered: hours and minutes (e.g. 1080 -> "18h", 90 -> "1h 30m").
function formatSteepTime(minutes: number | null): string {
  if (minutes == null) return '-'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

const columnHelper = createColumnHelper<Brew>()

const columns = [
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
    cell: (info) => formatSteepTime(info.getValue()),
  }),
  columnHelper.accessor('brewEnvironment', {
    header: 'Environment',
    cell: (info) => info.getValue() ?? '-',
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
    cell: (info) => (
      <span className="block whitespace-pre-wrap break-words lg:mx-auto lg:max-w-[16rem]">
        {info.getValue() ?? '-'}
      </span>
    ),
    enableSorting: false,
    meta: { cardFullWidth: true },
  }),
]

// The Cold Brew log — one tab of the /brews page. Mirrors the other brew
// sections. Dial-in (highlight + toggle) and row actions (edit/delete) arrive
// in later tickets, so this is display-only for now.
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
        <p className="text-sm text-muted-foreground">
          No cold brews yet.{' '}
          <Link to="/cold-brew/new" className="underline">
            Log your first brew
          </Link>
          .
        </p>
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
          <DataTable table={table} />
        </>
      )}
    </Card>
  )
}
