import { describe, expect, it } from 'vitest'
import { isPendingDeletion } from './pending-deletion'

describe('isPendingDeletion', () => {
  it('is true when deletedAt is set', () => {
    expect(isPendingDeletion({ deletedAt: new Date('2026-01-01') })).toBe(true)
    expect(isPendingDeletion({ deletedAt: '2026-01-01T00:00:00.000Z' })).toBe(
      true,
    )
  })

  it('is false when the account is live', () => {
    expect(isPendingDeletion({})).toBe(false)
    expect(isPendingDeletion({ deletedAt: null })).toBe(false)
  })
})
