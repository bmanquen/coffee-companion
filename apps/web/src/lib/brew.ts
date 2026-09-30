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

// Collapse empty higher units from a fromSeconds breakdown. `units` is which
// parts are applicable (Cold Brew: hours + minutes; Pour Over: all three).
function formatApplicableParts(
  total: number | null,
  units: ReadonlyArray<'hours' | 'minutes' | 'seconds'>,
  zero: string,
): string {
  if (total == null) return '-'
  const parts = fromSeconds(total)
  const suffix = { hours: 'h', minutes: 'm', seconds: 's' } as const
  const shown = units
    .map((unit) => Number(parts[unit]) && `${Number(parts[unit])}${suffix[unit]}`)
    .filter(Boolean)
  return shown.length === 0 ? zero : shown.join(' ')
}

// Cold Brew's column is still whole minutes (#85: no migration). Convert to
// seconds at this edge, then show only the applicable hours + minutes parts
// (18h, 1h 30m, 0m — never seconds).
export function formatSteepMinutes(minutes: number | null): string {
  return formatApplicableParts(
    minutes == null ? null : minutes * 60,
    ['hours', 'minutes'],
    '0m',
  )
}

// Pour Over, French Press, and AeroPress already store seconds.
export function formatBrewSeconds(seconds: number | null): string {
  return formatApplicableParts(seconds, ['hours', 'minutes', 'seconds'], '0s')
}

function parseWeight(value: string | number | null | undefined): number | null {
  if (value == null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

// 1:x from output / dose (espresso yield, or water on the other methods).
// Null when either weight is missing or dose is zero — derived, never stored.
export function formatBrewRatio(
  dose: string | number | null | undefined,
  output: string | number | null | undefined,
): string | null {
  const d = parseWeight(dose)
  const o = parseWeight(output)
  if (d == null || o == null || d === 0) return null
  const ratio = o / d
  if (!Number.isFinite(ratio)) return null
  // Two decimals is the usual 1:x. A positive output smaller than half a
  // hundredth of the dose would otherwise round to "1:0".
  if (ratio > 0) {
    for (let decimals = 2; decimals <= 6; decimals++) {
      const rounded = Number(ratio.toFixed(decimals))
      if (rounded !== 0) return `1:${rounded}`
    }
    return `1:${ratio}`
  }
  return `1:${Number(ratio.toFixed(2))}`
}
