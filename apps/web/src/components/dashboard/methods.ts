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

// A method paired with its newest-first Brew history — what the recency and
// selection helpers below read. Each feed is already ordered newest-first.
export type MethodFeed = {
  method: DashboardMethod
  brews: ReadonlyArray<{ createdAt: Date }>
}

// Whether a raw URL-param value is one of the known dashboard methods. Used to
// validate the search param before trusting it. Pure.
export function isDashboardMethod(
  value: string | undefined,
): value is DashboardMethod {
  return dashboardMethods.some((m) => m.value === value)
}

// Given each method's newest-first brew history, the method of the single most
// recent Brew across all of them — what the dashboard should open to. Each
// feed is already ordered newest-first, so only its first brew is compared.
// Falls back to Espresso when there are no Brews at all; ties resolve toward
// the earlier feed in the list. Pure so it can be unit tested.
export function mostRecentMethod(feeds: Array<MethodFeed>): DashboardMethod {
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

// The method the dashboard should show: a valid URL search param wins, so a
// deep-linked or reloaded view is honoured. An absent, invalid, or unrecognized
// param defers to the most-recent Brew (which itself falls back to Espresso when
// there are no Brews). Pure so it can be unit tested.
export function resolveSelectedMethod(
  param: string | undefined,
  feeds: Array<MethodFeed>,
): DashboardMethod {
  if (isDashboardMethod(param)) return param
  return mostRecentMethod(feeds)
}
