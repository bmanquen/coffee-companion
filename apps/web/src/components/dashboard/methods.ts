// The dashboard's Brewing Methods: the switcher's tab config plus the helper
// that picks which tab to open to. Kept separate from the route so the pure
// derivation can be unit tested without rendering.

// The five methods the dashboard switches between, in the agreed tab order —
// Espresso, Pour Over, French Press, AeroPress, Cold Brew.
export type DashboardMethod =
  | 'espresso'
  | 'pourover'
  | 'frenchpress'
  | 'aeropress'
  | 'coldbrew'

export const dashboardMethods: Array<{
  value: DashboardMethod
  label: string
}> = [
  { value: 'espresso', label: 'Espresso' },
  { value: 'pourover', label: 'Pour Over' },
  { value: 'frenchpress', label: 'French Press' },
  { value: 'aeropress', label: 'AeroPress' },
  { value: 'coldbrew', label: 'Cold Brew' },
]

// Given each method's newest-first brew history, the method of the single most
// recent Brew across all of them — what the dashboard should open to. Each
// feed is already ordered newest-first, so only its first brew is compared.
// Falls back to Espresso when there are no Brews at all; ties resolve toward
// the earlier feed in the list. Pure so it can be unit tested.
export function mostRecentMethod(
  feeds: Array<{
    method: DashboardMethod
    brews: ReadonlyArray<{ createdAt: Date }>
  }>,
): DashboardMethod {
  let best: { method: DashboardMethod; at: number } | null = null
  for (const feed of feeds) {
    // Each feed is newest-first, so its first brew is the one to compare.
    if (feed.brews.length === 0) continue
    const at = feed.brews[0].createdAt.getTime()
    if (best === null || at > best.at) {
      best = { method: feed.method, at }
    }
  }
  return best?.method ?? 'espresso'
}
