import { coffeeOptionLabel } from '@coffee-companion/brew-display'
import { useQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import type { EspressoShotWithRelations } from '@/types'
import {
  dialedInCoffeeColumn,
  renderBrewDetails,
} from '@/components/brews/brew-details'
import { ratioColumn } from '@/components/brews/brew-ratio'
import { BrewFeed } from '@/components/dashboard/brew-feed'
import { expanderColumn } from '@/components/data-table'
import { EspressoShotPager } from '@/components/brews/espresso-shot-pager'
import { Button } from '@/components/ui/button'
import {
  ESPRESSO_COFFEES_LOAD_FAILED,
  ESPRESSO_COFFEES_STALE_TIME_MS,
  ESPRESSO_LOADING_SHOTS,
  useEspressoShotPages,
} from '@/hooks/use-espresso-shot-pages'
import { useTRPC } from '@/integrations/trpc/react'

const columnHelper = createColumnHelper<EspressoShotWithRelations>()

// The dial-in summary (see ADR-0002): coffee identity, then the levers you turn
// dialing in espresso — grind, real weights (dose→yield), and time. Grinder,
// device, days off roast and notes live in the expander
// (BrewDetails). On desktop these are scannable columns; on mobile they collapse
// into the card's summary line, everything else revealed on expand.
export const espressoSummaryColumns = [
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
]

// The feed's own columns: the shared summary plus the expander that reveals
// grinder, device, days off roast and notes.
const columns = [
  ...espressoSummaryColumns,
  expanderColumn<EspressoShotWithRelations>(),
]

export function EspressoBrewFeed() {
  const trpc = useTRPC()
  const coffeesQuery = useQuery({
    ...trpc.coffee.getAll.queryOptions(),
    staleTime: ESPRESSO_COFFEES_STALE_TIME_MS,
  })
  const coffees = coffeesQuery.data ?? []
  const [coffeeId, setCoffeeId] = useState('')
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
    <>
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
        coffeeFilter={{ value: coffeeId, onChange: setCoffeeId }}
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
            ) : null}
          </>
        }
        dialedInFilter={{ value: dialedInOnly, onChange: setDialedInOnly }}
        stale={stale}
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
      {loading || (loadError && items.length === 0) ? null : (
        <EspressoShotPager
          hasMore={hasMore}
          loadingMore={loadingMore}
          loadMoreError={loadMoreError}
          loadMore={loadMore}
        />
      )}
    </>
  )
}
