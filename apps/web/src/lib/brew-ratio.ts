// Pure helpers for espresso shot brew ratios. Extracted from the espresso table
// route so they can be unit tested in isolation.

// The numeric brew ratio (yield / dose), or null when either value is missing.
// Dose and yield are stored as decimal strings, e.g. "18", "36.5".
export function brewRatio(
  dose: string | null | undefined,
  yld: string | null | undefined,
): number | null {
  if (!dose || !yld) return null
  return Number(yld) / Number(dose)
}

// The brew ratio formatted for display, e.g. "1:2.0", or "-" when unknown.
export function formatBrewRatio(
  dose: string | null | undefined,
  yld: string | null | undefined,
): string {
  const ratio = brewRatio(dose, yld)
  if (ratio === null) return '-'
  return `1:${ratio.toFixed(1)}`
}
