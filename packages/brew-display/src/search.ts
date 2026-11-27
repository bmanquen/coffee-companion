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

export type SearchableCoffee = {
  name: string
  notes: string | null
  roaster: { name: string } | null
  roastLevel: { name: string } | null
  origins: ReadonlyArray<{
    country: { name: string } | null
    region: { name: string } | null
    process: { name: string } | null
  }>
  // null where a legacy Coffee points at a lookup the reader can't see.
  varieties: ReadonlyArray<{ name: string } | null>
}

// The Coffees list, on web and mobile. Only the Coffee's own fields: a
// Coffee is never Sealed, and its Brews are not searched here.
export function coffeeMatchesSearch(
  query: string,
  coffee: SearchableCoffee,
): boolean {
  return matchesSearch(query, [
    coffee.name,
    coffee.roaster?.name,
    coffee.roastLevel?.name,
    coffee.notes,
    ...coffee.varieties.map((v) => v?.name),
    ...coffee.origins.flatMap((o) => [
      o.country?.name,
      o.region?.name,
      o.process?.name,
    ]),
  ])
}
