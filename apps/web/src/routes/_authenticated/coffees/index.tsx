import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  createColumnHelper,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { CoffeeIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import type { CellContext } from '@tanstack/react-table'
import { DataTable } from '@/components/data-table'
import { H1 } from '@/components/typography/h1'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { useAccordionExpansion } from '@/hooks/use-accordion-expansion'
import { useTRPC } from '@/integrations/trpc/react'

export const Route = createFileRoute('/_authenticated/coffees/')({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(
      context.trpc.coffee.getAll.queryOptions(),
    )
  },
  component: Coffee,
})

// The rows come from coffee.getAll; this narrows to the fields the card uses.
type CoffeeRow = {
  id: string
  name: string
  notes: string | null
  roaster: { name: string } | null
  roastLevel: { name: string } | null
  country: { name: string } | null
  region: { name: string } | null
  process: { name: string } | null
  varieties: Array<{ name: string }>
  dialedInShot: {
    dose: string | null
    yield: string | null
    time: number | null
    grindSetting: string | null
  } | null
}

const columnHelper = createColumnHelper<CoffeeRow>()

// The dialed-in espresso recipe, compacted to a single line (or a dash).
function formatDialedInShot(shot: CoffeeRow['dialedInShot']): string {
  if (!shot) return '-'
  const parts: Array<string> = []
  if (shot.dose && shot.yield) parts.push(`${shot.dose}g → ${shot.yield}g`)
  if (shot.time) parts.push(`${shot.time}s`)
  if (shot.grindSetting) parts.push(`Grind ${shot.grindSetting}`)
  return parts.length > 0 ? parts.join(' · ') : '-'
}

function CoffeeActionsCell({ row }: CellContext<CoffeeRow, unknown>) {
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
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Delete coffee"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete coffee</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{coffee.name}&quot;? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <DialogClose asChild>
              <Button
                variant="destructive"
                disabled={deleteCoffee.isPending}
                onClick={() => deleteCoffee.mutate(coffee.id)}
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

// Coffee cards follow the same summary/detail split as brews, but a coffee is
// not a brew — its summary is identity (name · roaster · origin) rather than a
// dial-in triangle (see ADR-0002). Process, roast level, varieties, notes and
// the dialed-in espresso recipe live in the expander.
const columns = [
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
  columnHelper.accessor((row) => row.country?.name ?? '', {
    id: 'country',
    header: 'Country',
    cell: (info) => info.getValue() || '-',
    meta: { cardSummary: true },
  }),
  columnHelper.accessor((row) => row.region?.name ?? '', {
    id: 'region',
    header: 'Region',
    cell: (info) => info.getValue() || '-',
    meta: { cardSummary: true },
  }),
  columnHelper.accessor((row) => row.process?.name ?? '', {
    id: 'process',
    header: 'Process',
    cell: (info) => info.getValue() || '-',
  }),
  columnHelper.accessor((row) => row.roastLevel?.name ?? '', {
    id: 'roastLevel',
    header: 'Roast level',
    cell: (info) => info.getValue() || '-',
  }),
  columnHelper.accessor((row) => row.varieties.map((v) => v.name).join(', '), {
    id: 'varieties',
    header: 'Varieties',
    cell: (info) => info.getValue() || '-',
    enableSorting: false,
  }),
  columnHelper.display({
    id: 'dialedIn',
    header: 'Dialed-in espresso',
    cell: ({ row }) => formatDialedInShot(row.original.dialedInShot),
  }),
  columnHelper.accessor('notes', {
    header: 'Notes',
    cell: (info) => info.getValue() ?? '-',
    enableSorting: false,
    meta: { cardFullWidth: true },
  }),
  columnHelper.display({
    id: 'actions',
    header: '',
    cell: CoffeeActionsCell,
    enableSorting: false,
    meta: { cardHideLabel: true },
  }),
]

function Coffee() {
  'use no memo'
  const trpc = useTRPC()
  const { data: coffees } = useSuspenseQuery(trpc.coffee.getAll.queryOptions())

  const expansion = useAccordionExpansion()

  const table = useReactTable({
    data: coffees as Array<CoffeeRow>,
    columns,
    // Mobile cards collapse to name · roaster · origin; expansion (accordion)
    // reveals process, roast level, varieties, notes and the dialed-in recipe.
    state: { expanded: expansion.expanded },
    onExpandedChange: expansion.onExpandedChange,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
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
        <DataTable table={table} />
      </Card>
    </div>
  )
}
