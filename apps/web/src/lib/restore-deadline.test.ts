import { describe, expect, it } from 'vitest'
import {
  formatRestoreDeadline,
  restoreDeadlineCopy,
} from './restore-deadline'

describe('restore deadline copy', () => {
  it('adds the same window the purge uses and spells the month', () => {
    const deletedAt = new Date('2026-10-05T12:00:00.000Z')

    expect(formatRestoreDeadline(deletedAt, 'UTC')).toBe('November 4, 2026')
    expect(restoreDeadlineCopy(deletedAt, 'UTC')).toBe(
      'Restore your account before November 4, 2026 to keep it. Your account data will be deleted on or after that day.',
    )
  })

  it('names the local calendar day, which can differ from UTC near midnight', () => {
    const deletedAt = new Date('2026-10-05T04:30:00.000Z')

    expect(formatRestoreDeadline(deletedAt, 'UTC')).toBe('November 4, 2026')
    expect(formatRestoreDeadline(deletedAt, 'America/New_York')).toBe(
      'November 3, 2026',
    )
  })
})
