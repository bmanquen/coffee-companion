import { describe, expect, it } from 'vitest'
import { PG_UNIQUE_VIOLATION, isPgUniqueViolation } from './pg-error'

describe('isPgUniqueViolation', () => {
  it('matches the named Postgres unique-violation code', () => {
    expect(isPgUniqueViolation({ code: PG_UNIQUE_VIOLATION })).toBe(true)
  })

  it('walks cause to find the code', () => {
    expect(
      isPgUniqueViolation({
        cause: { cause: { code: PG_UNIQUE_VIOLATION } },
      }),
    ).toBe(true)
  })

  it('rejects other codes and non-objects', () => {
    expect(isPgUniqueViolation({ code: '23503' })).toBe(false)
    expect(isPgUniqueViolation(new Error('boom'))).toBe(false)
    expect(isPgUniqueViolation(null)).toBe(false)
  })
})
