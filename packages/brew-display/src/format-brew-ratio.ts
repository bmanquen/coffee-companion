function parseWeight(value: string | number | null | undefined): number | null {
  if (value == null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

// Rounds half away from zero on the decimal value, as Postgres rounds
// numerics (the API's ratio search), not on its nearest binary double:
// 53.5 / 20 is 2.67499… as a double, so toFixed(2) would give 2.67.
function roundDecimal(value: number, decimals: number): number {
  const scale = 10 ** decimals
  const scaled = Number((Math.abs(value) * scale).toPrecision(15))
  return (Math.sign(value) * Math.round(scaled)) / scale
}

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
      const rounded = roundDecimal(ratio, decimals)
      if (rounded !== 0) return `1:${rounded}`
    }
    return `1:${ratio}`
  }
  return `1:${roundDecimal(ratio, 2)}`
}
