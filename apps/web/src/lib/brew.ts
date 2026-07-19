// General brew helpers, method-agnostic (roast date applies to any brew, not
// just espresso). Espresso-shot ratio/dialed-in helpers live in brew-ratio.ts.

// Whole days between when the beans were roasted and when a brew was pulled —
// a fixed fact per brew (roast date → brew time), not "days since roast until
// now". Null when the brew has no roast date. This freshness number, not the
// raw date, is what matters for dialing in. Pure so it can be unit tested.
export function daysOffRoast(
  roastDate: string | null,
  brewedAt: Date,
): number | null {
  if (!roastDate) return null
  const days = Math.floor(
    (brewedAt.getTime() - new Date(roastDate).getTime()) / 86_400_000,
  )
  return days < 0 ? 0 : days
}

// Cold brew steeps for hours and stores its steep time as whole minutes (unlike
// the hot methods, which store seconds). Render it the way it's entered — hours
// and minutes, e.g. 1080 -> "18h", 90 -> "1h 30m", 45 -> "45m" — or "-" when
// unknown. Pure so it can be unit tested.
export function formatSteepMinutes(minutes: number | null): string {
  if (minutes == null) return '-'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}
