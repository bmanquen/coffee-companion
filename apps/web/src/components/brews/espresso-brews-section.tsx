import { coffeeOptionLabel } from '@coffee-companion/brew-display'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  createColumnHelper,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { CellContext, SortingState } from '@tanstack/react-table'
import {
  brewLogRowClass,
  renderBrewDetails,
} from '@/components/brews/brew-details'
import { ratioColumn } from '@/components/brews/brew-ratio'
import { BrewsEmptyState } from '@/components/brews/brews-empty-state'
import { DeleteBrewDialog } from '@/components/brews/delete-brew-dialog'
import { BrewDialedInCell } from '@/components/brews/dialed-in-toggle-cell'
import { EspressoShotPager } from '@/components/brews/espresso-shot-pager'
import { CoffeeFilter } from '@/components/coffee-filter'
import { SealedRowNotice } from '@/components/brews/sealed-row'
import { DataTable, expanderColumn } from '@/components/data-table'
import { useAccordionExpansion } from '@/hooks/use-accordion-expansion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { invalidateDeviceDialedInQueries } from '@/hooks/use-device-dialed-in'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import {
  ESPRESSO_COFFEES_LOAD_FAILED,
  ESPRESSO_LOADING_SHOTS,
  ESPRESSO_SHOT_FILTER_DEBOUNCE_MS,
  ESPRESSO_SHOT_Q_MAX,
  useEspressoShotPages,
} from '@/hooks/use-espresso-shot-pages'
import { useTRPC } from '@/integrations/trpc/react'

type Shot = {
  id: string
  coffeeId: string
  brewingDeviceId: string | null
  isDialedIn: boolean
  roastDate: string | null
  createdAt: Date
  dose: string | null
  yield: string | null
  time: number | null
  grindSetting: string | null
  notes: string | null
  coffee: { name: string; roaster?: { name: string | null } | null }
  grinder: { name: string; brand: string } | null
  brewingDevice: { name: string; brand: string; type: { name: string } } | null
  sealed: boolean
}

const columnHelper = createColumnHelper<Shot>()

function DialedInCell({ row }: CellContext<Shot, unknown>) {
  return <BrewDialedInCell brewingMethod="espresso" brew={row.original} />
}

function ActionsCell({ row }: CellContext<Shot, unknown>) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const deleteShot = useMutation(
    trpc.espressoShot.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.espressoShot.getRecent.queryFilter())
        queryClient.invalidateQueries(
          trpc.espressoShot.getLatestUnsealed.queryFilter(),
        )
        queryClient.invalidateQueries(trpc.coffee.getAll.queryOptions())
        invalidateDeviceDialedInQueries(queryClient, trpc)
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
        coffeeName={coffeeOptionLabel(shot.coffee)}
        isPending={deleteShot.isPending}
        onDelete={() => deleteShot.mutate(shot.id)}
      />
    </div>
  )
}

// The dial-in summary (see ADR-0002): coffee identity, then the levers you turn
// dialing in — Grind · Dose · Yield · Time. Grinder, device, days off roast and
// notes are demoted to the expander (BrewDetails), reached on both the mobile
// card and the desktop sub-row (see ADR-0003). Leading dialed-in toggle and
// trailing edit/delete are cardHideLabel controls; the chevron is desktop-only.
const columns = [
  columnHelper.display({
    id: 'dialedIn',
    header: '',
    cell: DialedInCell,
    enableSorting: false,
    meta: { cardHideLabel: true },
  }),
  columnHelper.accessor((row) => coffeeOptionLabel(row.coffee), {
    id: 'coffee',
    header: 'Coffee',
    meta: { cardTitle: true },
  }),
  columnHelper.accessor('grindSetting', {
    header: 'Grind',
    cell: (info) => info.getValue() ?? '-',
    meta: { cardSummary: true, cardSummaryLabel: true },
  }),
  columnHelper.accessor('dose', {
    header: 'Dose',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
    sortingFn: (a, b) =>
      Number(a.original.dose ?? 0) - Number(b.original.dose ?? 0),
    meta: { cardSummary: true, cardSummaryLabel: true },
  }),
  columnHelper.accessor('yield', {
    header: 'Yield',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
    sortingFn: (a, b) =>
      Number(a.original.yield ?? 0) - Number(b.original.yield ?? 0),
    meta: { cardSummary: true, cardSummaryLabel: true },
  }),
  ratioColumn((row: Shot) => row.yield),
  columnHelper.accessor('time', {
    header: 'Time',
    cell: (info) => (info.getValue() ? `${info.getValue()}s` : '-'),
    meta: { cardSummary: true, cardSummaryLabel: true },
  }),
  columnHelper.display({
    id: 'actions',
    header: '',
    cell: ActionsCell,
    enableSorting: false,
    meta: { cardHideLabel: true },
  }),
  expanderColumn<Shot>(),
]

// The Espresso brew log on /brews. Mirrors the equipment
// page's section components (heading + add button + filters + table).
export function EspressoBrewsSection() {
  'use no memo'
  const trpc = useTRPC()
  const coffeesQuery = useQuery({
    ...trpc.coffee.getAll.queryOptions(),
    staleTime: Infinity,
  })
  const coffees = coffeesQuery.data ?? []
  const [sorting, setSorting] = useState<SortingState>([])
  const [q, setQ] = useState('')
  const [coffeeId, setCoffeeId] = useState('')
  const expansion = useAccordionExpansion()
  const debouncedQ = useDebouncedValue(q, ESPRESSO_SHOT_FILTER_DEBOUNCE_MS)
  const filtering = Boolean(coffeeId || debouncedQ.trim())
  const {
    items: shots,
    hasMore,
    loadingMore,
    loadMore,
    loadMoreError,
    loading,
    loadError,
    stale,
    retry,
  } = useEspressoShotPages({
      coffeeId: coffeeId || undefined,
      q: debouncedQ.trim() || undefined,
    })

  const coffeeOptions = useMemo(
    () =>
      coffees
        .map((coffee) => ({
          value: coffee.id,
          label: coffeeOptionLabel(coffee),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [coffees],
  )

  const table = useReactTable({
    data: shots,
    columns,
    // Both layouts collapse to the dial-in summary; expansion (accordion)
    // reveals grinder, device, days off roast and notes via BrewDetails — a
    // card detail region on mobile, a desktop sub-row (see ADR-0003).
    state: { sorting, expanded: expansion.expanded },
    onSortingChange: setSorting,
    onExpandedChange: expansion.onExpandedChange,
    enableSorting: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    // A Sealed Brew has no settings to reveal.
    getRowCanExpand: (row) => !row.original.sealed,
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
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        {coffeesQuery.isError && coffees.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p role="alert">{ESPRESSO_COFFEES_LOAD_FAILED}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void coffeesQuery.refetch()
              }}
            >
              Try again
            </Button>
          </div>
        ) : (
          <CoffeeFilter
            options={coffeeOptions}
            value={coffeeId}
            onChange={setCoffeeId}
          />
        )}
        <Input
          placeholder="Filter shots..."
          value={q}
          maxLength={ESPRESSO_SHOT_Q_MAX}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1"
        />
      </div>
      {loading ? (
        <p role="status">{ESPRESSO_LOADING_SHOTS}</p>
      ) : (
        <>
          {loadError ? (
            <div className="flex flex-col gap-2">
              <p role="alert">{loadError}</p>
              <Button type="button" variant="outline" onClick={retry}>
                Try again
              </Button>
            </div>
          ) : null}
          {shots.length === 0 && !filtering && !loadError ? (
            <BrewsEmptyState
              message="No espresso shots yet."
              to="/espresso/new"
              linkLabel="Log your first shot"
            />
          ) : shots.length === 0 && loadError ? null : (
            <>
              <div
                aria-busy={stale || undefined}
                className={stale ? 'opacity-60' : undefined}
              >
                <DataTable
                  table={table}
                  renderSubComponent={(row) => renderBrewDetails(row.original)}
                  replaceRow={(row) =>
                    row.original.sealed ? <SealedRowNotice /> : null
                  }
                  rowClassName={(row) =>
                    brewLogRowClass(
                      row.original.sealed,
                      row.original.isDialedIn,
                    )
                  }
                />
              </div>
              <EspressoShotPager
                hasMore={hasMore}
                loadingMore={loadingMore}
                loadMoreError={loadMoreError}
                loadMore={loadMore}
              />
            </>
          )}
        </>
      )}
    </Card>
  )
}
