// Brew times as the Brews lists show them, on web and mobile. Empty higher
// units collapse (165 → "2m 45s"). `units` is which parts apply to a method
// (Cold Brew: hours + minutes; the rest: all three).
function formatApplicableParts(
  total: number | null,
  units: ReadonlyArray<'hours' | 'minutes' | 'seconds'>,
  zero: string,
): string {
  if (total == null) return '-'
  if (!Number.isFinite(total)) return zero
  const parts = {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
  const suffix = { hours: 'h', minutes: 'm', seconds: 's' } as const
  const shown = units
    .filter((unit) => parts[unit])
    .map((unit) => `${parts[unit]}${suffix[unit]}`)
  return shown.length === 0 ? zero : shown.join(' ')
}

// Cold Brew's column is whole minutes (#85: no migration). Shown as hours and
// minutes only (18h, 1h 30m, 0m — never seconds).
export function formatSteepMinutes(minutes: number | null): string {
  return formatApplicableParts(
    minutes == null ? null : minutes * 60,
    ['hours', 'minutes'],
    '0m',
  )
}

// Pour Over, French Press, and AeroPress store seconds.
export function formatBrewSeconds(seconds: number | null): string {
  return formatApplicableParts(seconds, ['hours', 'minutes', 'seconds'], '0s')
}
