import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  createColumnHelper,
  createExpandedRowModel,
  useTable,
} from '@tanstack/react-table'
import { CoffeeIcon, Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatOriginNames } from '@/components/coffees/format-coffee-origins'
import { CoffeeDetails } from '@/components/coffees/coffee-details'
import {
  DataTable,
  expanderColumn,
  withRowModels,
} from '@/components/data-table'
import { DeleteWithBrewsDialog } from '@/components/delete-with-brews-dialog'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { useAccordionExpansion } from '@/hooks/use-accordion-expansion'
import { useTRPC } from '@/integrations/trpc/react'
import { matchesSearch } from '@/lib/search'
import type { CellContext } from '@tanstack/react-table'
import type { AppFeatures } from '@/components/data-table'

const features = withRowModels({
  expandedRowModel: createExpandedRowModel(),
})

export const Route = createFileRoute('/_authenticated/coffees/')({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(
      context.trpc.coffee.getAll.queryOptions(),
    )
  },
  component: Coffee,
})

// The rows come from coffee.getAll; this narrows to the identity summary and the
// detail fields the card/row render (everything below name is shown in the
// CoffeeDetails expander).
type CoffeeRow = {
  id: string
  name: string
  notes: string | null
  roaster: { name: string } | null
  roastLevel: { name: string } | null
  origins: Array<{
    country: { name: string } | null
    region: { name: string } | null
    process: { name: string } | null
  }>
  varieties: Array<{ name: string }>
  isDialedIn: boolean
}

const columnHelper = createColumnHelper<AppFeatures, CoffeeRow>()

function CoffeeActionsCell({
  row,
}: CellContext<AppFeatures, CoffeeRow, unknown>) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const deleteCoffee = useMutation(
    trpc.coffee.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.coffee.getAll.queryOptions())
      },
    }),
  )

  const coffee = row.original

  return (
    <div className="flex items-center justify-end gap-1">
      <Link to="/coffees/$coffeeId/edit" params={{ coffeeId: coffee.id }}>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Edit coffee"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </Link>
      <DeleteWithBrewsDialog
        noun="coffee"
        name={coffee.name}
        brewCountOptions={trpc.coffee.brewCount.queryOptions(coffee.id)}
        onDelete={() => deleteCoffee.mutate(coffee.id)}
        isPending={deleteCoffee.isPending}
      />
    </div>
  )
}

// Coffee cards/rows follow the same summary/detail split as brews, but a coffee
// is not a brew — its summary is identity (name · roaster · country · region)
// rather than a dial-in triangle (see ADR-0002). Process, roast level,
// varieties, the dialed-in espresso recipe and notes are demoted to the expander
// (CoffeeDetails), reached on both the mobile card and the desktop sub-row (see
// ADR-0003). The trailing chevron is desktop-only.
const columns = columnHelper.columns([
  columnHelper.accessor('name', {
    header: 'Name',
    meta: { cardTitle: true },
  }),
  columnHelper.accessor((row) => row.roaster?.name ?? '', {
    id: 'roaster',
    header: 'Roaster',
    cell: (info) => info.getValue() || '-',
    meta: { cardSummary: true },
  }),
  columnHelper.accessor((row) => formatOriginNames(row.origins, 'country'), {
    id: 'country',
    header: 'Country',
    cell: (info) => info.getValue(),
    meta: { cardSummary: true },
  }),
  columnHelper.accessor((row) => formatOriginNames(row.origins, 'region'), {
    id: 'region',
    header: 'Region',
    cell: (info) => info.getValue(),
    meta: { cardSummary: true },
  }),
  columnHelper.display({
    id: 'actions',
    header: '',
    cell: CoffeeActionsCell,
    enableSorting: false,
    meta: { cardHideLabel: true },
  }),
  expanderColumn<CoffeeRow>(),
])

export function Coffee() {
  'use no memo'
  const trpc = useTRPC()
  const { data: coffees } = useSuspenseQuery(trpc.coffee.getAll.queryOptions())

  const expansion = useAccordionExpansion()
  const [search, setSearch] = useState('')

  // Memoized so the table keeps a stable data reference between renders.
  const visibleCoffees = useMemo(
    () =>
      (coffees as Array<CoffeeRow>).filter((c) =>
        matchesSearch(search, [
          c.name,
          c.roaster?.name,
          c.roastLevel?.name,
          c.notes,
          ...c.varieties.map((v) => v.name),
          ...c.origins.flatMap((o) => [
            o.country?.name,
            o.region?.name,
            o.process?.name,
          ]),
        ]),
      ),
    [coffees, search],
  )

  const table = useTable({
    features,
    data: visibleCoffees,
    columns,
    // Both layouts collapse to the identity summary; expansion (accordion)
    // reveals process, roast level, varieties, whether the coffee has a
    // Dialed-in Brew, and notes via CoffeeDetails — a card detail region on
    // mobile, a desktop sub-row (see ADR-0003).
    state: { expanded: expansion.expanded },
    onExpandedChange: expansion.onExpandedChange,
    // v9 closes open rows whenever data changes, even a refetch with the
    // same rows; v8 only did that for grouped rows.
    autoResetExpanded: false,
    // By id, so an open row stays with its record when rows above it go.
    getRowId: (row) => row.id,
    getRowCanExpand: () => true,
  })

  if (coffees.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CoffeeIcon />
          </EmptyMedia>
          <EmptyTitle>No Coffees Yet</EmptyTitle>
          <EmptyDescription>
            You haven&apos;t added any coffees yet. Please add some coffee to
            get started.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link to="/coffees/new">
            <Button>
              <Plus />
              Add Coffee
            </Button>
          </Link>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto gap-8">
      <div className="flex justify-between items-center w-full">
        <H1>Coffees</H1>
        <Link to="/coffees/new">
          <Button>
            <Plus />
            Add Coffee
          </Button>
        </Link>
      </div>
      <Card className="flex flex-col gap-4 w-full bg-white p-6">
        <Input
          placeholder="Search coffees..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <DataTable
          table={table}
          renderSubComponent={(row) => (
            <CoffeeDetails
              process={formatOriginNames(row.original.origins, 'process')}
              roastLevel={row.original.roastLevel?.name ?? null}
              varieties={row.original.varieties.map((v) => v.name)}
              dialedIn={row.original.isDialedIn ? 'Yes' : '-'}
              notes={row.original.notes}
            />
          )}
        />
      </Card>
    </div>
  )
}
