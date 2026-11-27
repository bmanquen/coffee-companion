// Free-text search: does any value contain the query, ignoring case? Search is
// the same on every Plan. Sealed Brews arrive with their settings already
// blanked, so a search can only match what the reader is allowed to see.
export function matchesSearch(
  query: string,
  values: ReadonlyArray<string | number | null | undefined>,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return values.some((v) => v != null && String(v).toLowerCase().includes(q))
}

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
