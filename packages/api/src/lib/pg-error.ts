export const PG_UNIQUE_VIOLATION = '23505'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isPgUniqueViolation(err: unknown): boolean {
  let current: unknown = err
  for (let i = 0; i < 5; i++) {
    if (!isRecord(current)) return false
    if (current.code === PG_UNIQUE_VIOLATION) return true
    current = current.cause
  }
  return false
}
