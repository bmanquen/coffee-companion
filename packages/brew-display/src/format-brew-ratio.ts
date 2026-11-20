function parseWeight(value: string | number | null | undefined): number | null {
  if (value == null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

// Matches the API's ratio search (espressoShot.ts), so what shows is found.
const MAX_RATIO_DECIMALS = 20

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
  // hundredth of the dose would otherwise round to "1:0", so it keeps more
  // decimals, up to MAX_RATIO_DECIMALS (as the API's ratio search does).
  if (ratio > 0) {
    for (let decimals = 2; decimals <= MAX_RATIO_DECIMALS; decimals++) {
      const rounded = roundDecimal(ratio, decimals)
      if (rounded !== 0) return `1:${plainDecimal(rounded, decimals)}`
    }
  }
  return `1:${plainDecimal(roundDecimal(ratio, 2), 2)}`
}

// Fixed-point text without trailing zeros: 5e-8 is "0.00000005", as Postgres
// prints a numeric, not JS's scientific notation.
function plainDecimal(value: number, decimals: number): string {
  const text = value.toFixed(decimals)
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text
}
