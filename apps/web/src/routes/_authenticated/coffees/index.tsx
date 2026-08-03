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
import type { ReactNode } from 'react'
import { SealedBrewNotice } from '@/components/brews/sealed-brew-notice'
import { CoffeeDetails } from '@/components/coffees/coffee-details'
import { DataTable, expanderColumn } from '@/components/data-table'
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

// The rows come from coffee.getAll; this narrows to the identity summary and the
// detail fields the card/row render (everything below name is shown in the
// CoffeeDetails expander).
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
    sealed: boolean
    dose: string | null
    yield: string | null
    time: number | null
    grindSetting: string | null
  } | null
}

const columnHelper = createColumnHelper<CoffeeRow>()

// The dialed-in espresso recipe, compacted to a single line (or a dash). A
// Sealed shot is still the coffee's reference — the settings just are not
// readable — so it says so rather than passing for a coffee with no dial-in.
function formatDialedInShot(shot: CoffeeRow['dialedInShot']): ReactNode {
  if (!shot) return '-'
  if (shot.sealed) return <SealedBrewNotice />
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

// Coffee cards/rows follow the same summary/detail split as brews, but a coffee
// is not a brew — its summary is identity (name · roaster · country · region)
// rather than a dial-in triangle (see ADR-0002). Process, roast level,
// varieties, the dialed-in espresso recipe and notes are demoted to the expander
// (CoffeeDetails), reached on both the mobile card and the desktop sub-row (see
// ADR-0003). The trailing chevron is desktop-only.
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
  columnHelper.display({
    id: 'actions',
    header: '',
    cell: CoffeeActionsCell,
    enableSorting: false,
    meta: { cardHideLabel: true },
  }),
  expanderColumn<CoffeeRow>(),
]

export function Coffee() {
  'use no memo'
  const trpc = useTRPC()
  const { data: coffees } = useSuspenseQuery(trpc.coffee.getAll.queryOptions())

  const expansion = useAccordionExpansion()

  const table = useReactTable({
    data: coffees as Array<CoffeeRow>,
    columns,
    // Both layouts collapse to the identity summary; expansion (accordion)
    // reveals process, roast level, varieties, the dialed-in recipe and notes
    // via CoffeeDetails — a card detail region on mobile, a desktop sub-row
    // (see ADR-0003).
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
        <DataTable
          table={table}
          renderSubComponent={(row) => (
            <CoffeeDetails
              process={row.original.process?.name ?? null}
              roastLevel={row.original.roastLevel?.name ?? null}
              varieties={row.original.varieties.map((v) => v.name)}
              dialedInEspresso={formatDialedInShot(row.original.dialedInShot)}
              notes={row.original.notes}
            />
          )}
        />
      </Card>
    </div>
  )
}
