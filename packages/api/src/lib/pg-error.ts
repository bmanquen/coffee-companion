export const PG_UNIQUE_VIOLATION = '23505'

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
