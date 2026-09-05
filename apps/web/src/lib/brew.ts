import { fromSeconds } from './duration'

// General brew helpers, method-agnostic (roast date applies to any brew, not
// just espresso).

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

function formatFromSeconds(total: number | null): string {
  if (total == null) return '-'
  const { hours, minutes, seconds } = fromSeconds(total)
  const parts = [
    Number(hours) && `${Number(hours)}h`,
    Number(minutes) && `${Number(minutes)}m`,
    Number(seconds) && `${Number(seconds)}s`,
  ].filter(Boolean)
  return parts.length === 0 ? '0s' : parts.join(' ')
}

// Cold brew's column is still whole minutes (#85: no migration). Convert to
// seconds at this edge, then collapse the fromSeconds parts (18h, 1h 30m).
export function formatSteepMinutes(minutes: number | null): string {
  return formatFromSeconds(minutes == null ? null : minutes * 60)
}

// Pour Over (and later French Press / AeroPress) already store seconds.
export function formatBrewSeconds(seconds: number | null): string {
  return formatFromSeconds(seconds)
}
