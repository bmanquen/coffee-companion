// The matcher is shared with mobile (@coffee-companion/brew-display).
import { matchesSearch } from '@coffee-companion/brew-display'

type SearchableBrew = {
  coffee: { name: string }
  grindSetting: string | null
  dose: string | null
  water: string | null
  notes: string | null
  grinder: { name: string } | null
  brewingDevice: { name: string } | null
}

// The non-espresso Brews lists: their row fields plus notes and gear. `shown`
// is what that method's own columns add, such as its method and formatted time.
export function brewMatchesSearch(
  query: string,
  brew: SearchableBrew,
  shown: ReadonlyArray<string | number | null | undefined>,
): boolean {
  return matchesSearch(query, [
    brew.coffee.name,
    brew.grindSetting,
    brew.dose,
    brew.water,
    brew.notes,
    brew.grinder?.name,
    brew.brewingDevice?.name,
    ...shown,
  ])
}
