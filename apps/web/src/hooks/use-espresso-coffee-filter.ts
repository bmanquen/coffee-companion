import { coffeeOptionLabel } from '@coffee-companion/brew-display'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { ESPRESSO_COFFEES_STALE_TIME_MS } from '@/hooks/use-espresso-shot-pages'
import { useTRPC } from '@/integrations/trpc/react'

// The coffee filter on the espresso feeds: the catalog, its options sorted by
// label, and the picked coffee ('' for all).
export function useEspressoCoffeeFilter() {
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
  return { coffeesQuery, coffees, coffeeOptions, coffeeId, setCoffeeId }
}
