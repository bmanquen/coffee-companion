// An exact decimal: units × 10^-scale, as Postgres keeps a numeric.
type Decimal = { units: bigint; scale: number }

// Postgres's display-scale ceiling, which caps a quotient's decimals.
const MAX_SCALE = 1000
// The most decimals a Postgres numeric accepts as input.
const MAX_INPUT_SCALE = 16383

// Plain or exponent decimal text, such as "18",
// ".5", "53.49999999999998", or "1e-7".
const DECIMAL_TEXT = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i

function parseWeight(
  value: string | number | null | undefined,
): Decimal | null {
  if (value == null) return null
  const raw = typeof value === 'number' ? String(value) : value.trim()
  if (raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  // Other forms Number reads (such as 0x10) go through its plain text.
  const text = DECIMAL_TEXT.test(raw) ? raw : String(n)
  const [, sign, whole, fraction = '', exponent = '0'] =
    DECIMAL_TEXT.exec(text)!
  const scale = fraction.length - Number(exponent)
  if (Math.abs(scale) > MAX_INPUT_SCALE) return null
  let units = BigInt(whole + fraction || '0')
  if (sign === '-') units = -units
  return scale >= 0
    ? { units, scale }
    : { units: units * 10n ** BigInt(-scale), scale: 0 }
}

// a / b rounded half away from zero, as Postgres rounds numerics.
function divideRounded(a: bigint, b: bigint): bigint {
  const negative = a < 0n !== b < 0n
  const absA = a < 0n ? -a : a
  const absB = b < 0n ? -b : b
  let q = absA / absB
  if ((absA % absB) * 2n >= absB) q += 1n
  return negative ? -q : q
}

function rescale(value: Decimal, scale: number): Decimal {
  const units =
    scale >= value.scale
      ? value.units * 10n ** BigInt(scale - value.scale)
      : divideRounded(value.units, 10n ** BigInt(value.scale - scale))
  return { units, scale }
}

// The first nonzero base-10000 digit of a numeric and its weight, as
// Postgres stores it (weight 0 holds 0–9999, -1 holds .0001–.9999).
function firstDigit({
  units,
  scale,
}: Decimal): [weight: number, digit: bigint] {
  const abs = units < 0n ? -units : units
  if (abs === 0n) return [0, 0n]
  const weight = Math.floor((abs.toString().length - 1 - scale) / 4)
  const shift = -4 * weight - scale
  const group =
    shift >= 0 ? abs * 10n ** BigInt(shift) : abs / 10n ** BigInt(-shift)
  return [weight, group % 10000n]
}

// output / dose as Postgres divides numerics (select_div_scale in numeric.c):
// at least 16 significant digits, and no fewer decimals than either input,
// rounded half away from zero. round() then rounds that result again, so
// 8.0249999999999999999999 / 3 is 2.6750000000000000000000 and shows 1:2.68.
function divideAsPostgres(output: Decimal, dose: Decimal): Decimal {
  const [outputWeight, outputDigit] = firstDigit(output)
  const [doseWeight, doseDigit] = firstDigit(dose)
  let quotientWeight = outputWeight - doseWeight
  if (outputDigit <= doseDigit) quotientWeight--
  const scale = Math.min(
    Math.max(16 - quotientWeight * 4, output.scale, dose.scale, 0),
    MAX_SCALE,
  )
  // output/dose × 10^scale = outputUnits × 10^(dose.scale + scale) /
  // (doseUnits × 10^output.scale).
  const units = divideRounded(
    output.units * 10n ** BigInt(dose.scale + scale),
    dose.units * 10n ** BigInt(output.scale),
  )
  return { units, scale }
}

// Matches the API's ratio search (espressoShot.ts), so what shows is found.
const MAX_RATIO_DECIMALS = 20

export function formatBrewRatio(
  dose: string | number | null | undefined,
  output: string | number | null | undefined,
): string | null {
  const d = parseWeight(dose)
  const o = parseWeight(output)
  if (d == null || o == null || d.units === 0n) return null
  const ratio = divideAsPostgres(o, d)
  // Two decimals is the usual 1:x. A positive output smaller than half a
  // hundredth of the dose would otherwise round to "1:0", so it keeps more
  // decimals, up to MAX_RATIO_DECIMALS (as the API's ratio search does).
  if (ratio.units > 0n) {
    for (let decimals = 2; decimals <= MAX_RATIO_DECIMALS; decimals++) {
      const rounded = rescale(ratio, decimals)
      if (rounded.units !== 0n) return `1:${plainDecimal(rounded)}`
    }
  }
  return `1:${plainDecimal(rescale(ratio, 2))}`
}

// Fixed-point text without trailing zeros, as Postgres's trim_scale prints a
// numeric: 5e-8 is "0.00000005", not JS's scientific notation.
function plainDecimal({ units, scale }: Decimal): string {
  const abs = (units < 0n ? -units : units).toString().padStart(scale + 1, '0')
  const whole = abs.slice(0, abs.length - scale)
  const fraction = abs.slice(abs.length - scale).replace(/0+$/, '')
  const text = fraction ? `${whole}.${fraction}` : whole
  return units < 0n ? `-${text}` : text
}
