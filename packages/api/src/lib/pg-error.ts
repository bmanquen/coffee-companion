export const PG_UNIQUE_VIOLATION = '23505'
export const PG_FOREIGN_KEY_VIOLATION = '23503'
export const PG_SERIALIZATION_FAILURE = '40001'

type PgErrorFields = { code: string; detail?: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// tRPC wraps Drizzle's error, which wraps the driver's, so the code sits a few causes down.
export function pgErrorIn(err: unknown, code: string): PgErrorFields | null {
  let current: unknown = err
  for (let i = 0; i < 5; i++) {
    if (!isRecord(current)) return null
    if (current.code === code) {
      return {
        code,
        ...(typeof current.detail === 'string' ? { detail: current.detail } : {}),
      }
    }
    current = current.cause
  }
  return null
}

export function isPgUniqueViolation(err: unknown): boolean {
  return pgErrorIn(err, PG_UNIQUE_VIOLATION) !== null
}

// PostgreSQL's DETAIL for a reference to a row that isn't there.
// lookup_reference_guard() words another user's private lookup the same way.
const MISSING_REFERENCE = /is not present in table "([^"]+)"/

const REFERENCE_NAMES: Partial<Record<string, string>> = {
  coffees: 'Coffee',
  grinders: 'Grinder',
  brewing_devices: 'Brewing device',
  brewing_device_types: 'Brewing device type',
  roasters: 'Roaster',
  roast_levels: 'Roast level',
  countries: 'Country',
  regions: 'Region',
  farms: 'Farm',
  coffee_processes: 'Process',
  varieties: 'Variety',
  aeropress_methods: 'Method',
  pourover_methods: 'Method',
  frenchpress_methods: 'Method',
}

/** "Roaster not found" for a write that referenced a row the user may not use, or null for any other error. */
export function missingReferenceMessage(err: unknown): string | null {
  const detail = pgErrorIn(err, PG_FOREIGN_KEY_VIOLATION)?.detail
  const table = detail?.match(MISSING_REFERENCE)?.[1]
  const name = table ? REFERENCE_NAMES[table] : undefined
  return name ? `${name} not found` : null
}
