import { coffeeOptionLabel } from '@coffee-companion/brew-display'
import { useQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import {
  dialedInCoffeeColumn,
  renderBrewDetails,
} from '@/components/brews/brew-details'
import { ratioColumn } from '@/components/brews/brew-ratio'
import { BrewFeed } from '@/components/dashboard/brew-feed'
import { expanderColumn } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import {
  ESPRESSO_COFFEES_LOAD_FAILED,
  ESPRESSO_COFFEES_STALE_TIME_MS,
  ESPRESSO_LOADING_SHOTS,
  useEspressoShotPages,
} from '@/hooks/use-espresso-shot-pages'
import { useTRPC } from '@/integrations/trpc/react'
import type { EspressoShotWithRelations } from '@/types'
import type { AppFeatures } from '@/components/data-table'

const columnHelper = createColumnHelper<
  AppFeatures,
  EspressoShotWithRelations
>()

// The dial-in summary (see ADR-0002): coffee identity, then the levers you turn
// dialing in espresso — grind, real weights (dose→yield), and time. Grinder,
// device, days off roast and notes live in the expander
// (BrewDetails). On desktop these are scannable columns; on mobile they collapse
// into the card's summary line, everything else revealed on expand.
export const espressoSummaryColumns = columnHelper.columns([
  dialedInCoffeeColumn<EspressoShotWithRelations>(),
  columnHelper.accessor('grindSetting', {
    header: 'Grind',
    cell: (info) => info.getValue() ?? '-',
    meta: { cardSummary: true, cardSummaryLabel: true },
  }),
  columnHelper.accessor('dose', {
    header: 'Dose',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
    meta: { cardSummary: true, cardSummaryLabel: true },
  }),
  columnHelper.accessor('yield', {
    header: 'Yield',
    cell: (info) => (info.getValue() ? `${info.getValue()}g` : '-'),
    meta: { cardSummary: true, cardSummaryLabel: true },
  }),
  ratioColumn((row: EspressoShotWithRelations) => row.yield),
  columnHelper.accessor('time', {
    header: 'Time',
    cell: (info) => (info.getValue() ? `${info.getValue()}s` : '-'),
    meta: { cardSummary: true, cardSummaryLabel: true },
  }),
])

// The feed's own columns: the shared summary plus the expander that reveals
// grinder, device, days off roast and notes.
const columns = columnHelper.columns([
  ...espressoSummaryColumns,
  expanderColumn<EspressoShotWithRelations>(),
])

// onChoose runs whenever the user changes a filter, pages on, or opens a
// shot, which the dashboard takes as choosing Espresso.
export function EspressoBrewFeed({ onChoose }: { onChoose?: () => void } = {}) {
  const trpc = useTRPC()
  const coffeesQuery = useQuery({
    ...trpc.coffee.getAll.queryOptions(),
    staleTime: ESPRESSO_COFFEES_STALE_TIME_MS,
  })
  const coffees = coffeesQuery.data ?? []
  const [pickedCoffeeId, setCoffeeId] = useState('')
  // A coffee deleted elsewhere drops out of the filter once the catalog loads
  // without it; until then (or if that refresh fails) the pick stands. The
  // pick is cleared, not just hidden, so a later failed refresh (which keeps
  // the old data but is no longer a success) cannot bring it back.
  const pickRemoved =
    coffeesQuery.isSuccess &&
    pickedCoffeeId !== '' &&
    !coffees.some((coffee) => coffee.id === pickedCoffeeId)
  if (pickRemoved) setCoffeeId('')
  const coffeeId = pickRemoved ? '' : pickedCoffeeId
  const [dialedInOnly, setDialedInOnly] = useState(false)
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
  const {
    items,
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
    dialedIn: dialedInOnly || undefined,
  })

  return (
    <BrewFeed
      title="Espresso"
      brews={items}
      columns={columns}
      renderDetails={(row) => renderBrewDetails(row.original)}
      newTo="/espresso/new"
      logLabel="Log Shot"
      emptyMessage="No espresso shots yet."
      emptyLinkLabel="Log your first shot"
      coffeeOptions={
        coffeesQuery.isError && coffees.length === 0 ? [] : coffeeOptions
      }
      coffeeFilter={{
        value: coffeeId,
        onChange: (next) => {
          setCoffeeId(next)
          onChoose?.()
        },
      }}
      banner={
        <>
          {loadError && items.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p role="alert">{loadError}</p>
              <Button type="button" variant="outline" onClick={retry}>
                Try again
              </Button>
            </div>
          ) : null}
          {/* Shown even with cached coffees, which stay pickable. */}
          {coffeesQuery.isError ? (
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
          ) : null}
        </>
      }
      dialedInFilter={{
        value: dialedInOnly,
        onChange: (next) => {
          setDialedInOnly(next)
          onChoose?.()
        },
      }}
      // An open shot must not vanish when a refresh moves recency elsewhere.
      onExpand={onChoose}
      onPageChange={onChoose}
      stale={stale}
      hasMore={hasMore}
      loadMore={() => {
        // Next may refresh the loaded pages first, and those could move
        // recency to another method mid-load; choose Espresso before then.
        onChoose?.()
        return loadMore()
      }}
      loadingMore={loadingMore}
      loadMoreError={loadMoreError}
      status={
        loading ? (
          <p role="status">{ESPRESSO_LOADING_SHOTS}</p>
        ) : loadError && items.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p role="alert">{loadError}</p>
            <Button type="button" variant="outline" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : undefined
      }
    />
  )
}
