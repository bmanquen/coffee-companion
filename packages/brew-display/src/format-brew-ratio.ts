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
