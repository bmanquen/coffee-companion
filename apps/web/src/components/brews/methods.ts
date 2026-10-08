// The five brewing methods the /brews log switches between, in the same
// order and with the same labels the page used when they were tabs.

export type BrewMethod =
  | 'espresso'
  | 'pourover'
  | 'frenchpress'
  | 'aeropress'
  | 'coldbrew'

export const brewMethods: Array<{ value: BrewMethod; label: string }> = [
  { value: 'espresso', label: 'Espresso' },
  { value: 'pourover', label: 'Pour Over' },
  { value: 'frenchpress', label: 'French Press' },
  { value: 'aeropress', label: 'AeroPress' },
  { value: 'coldbrew', label: 'Cold Brew' },
]

export function isBrewMethod(value: string | undefined): value is BrewMethod {
  return brewMethods.some((m) => m.value === value)
}

// A valid ?method= wins so a deep link or reload opens that log. Anything
// else — missing, empty, unknown — falls back to Espresso, the page default.
export function resolveBrewMethod(param: string | undefined): BrewMethod {
  return isBrewMethod(param) ? param : 'espresso'
}
