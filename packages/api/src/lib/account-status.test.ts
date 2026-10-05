import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_RESTORE_WINDOW_DAYS,
  isRestoreOpen,
  restoreDeadline,
} from './account-status'

describe('restore window', () => {
  const deletedAt = new Date('2026-01-01T00:00:00.000Z')

  it('closes 30 days after the account is marked deleted', () => {
    expect(ACCOUNT_RESTORE_WINDOW_DAYS).toBe(30)
    expect(restoreDeadline(deletedAt)).toEqual(
      new Date('2026-01-31T00:00:00.000Z'),
    )
  })

  it('is open before that deadline and closed on it', () => {
    expect(isRestoreOpen(deletedAt, new Date('2026-01-30T23:59:59.999Z'))).toBe(
      true,
    )
    expect(isRestoreOpen(deletedAt, new Date('2026-01-31T00:00:00.000Z'))).toBe(
      false,
    )
  })
})
