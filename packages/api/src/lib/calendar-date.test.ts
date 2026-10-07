import { describe, expect, it } from 'vitest'
import {
  calendarDateFromLocalDate,
  calendarDateSchema,
  calendarDaysUntil,
  localDateFromCalendarDate,
} from './calendar-date'

function zone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

describe('calendarDateSchema', () => {
  it('accepts a YYYY-MM-DD string', () => {
    expect(calendarDateSchema.parse('2026-05-01')).toBe('2026-05-01')
  })

  it('rejects a Date or a timestamp string', () => {
    expect(
      calendarDateSchema.safeParse(new Date('2026-05-01T00:00:00.000Z'))
        .success,
    ).toBe(false)
    expect(
      calendarDateSchema.safeParse('2026-05-01T00:00:00.000Z').success,
    ).toBe(false)
  })
})

describe('local calendar conversion', () => {
  it('is running in a zone where UTC conversion would shift the day', () => {
    const tz = zone()
    expect(['America/Chicago', 'Asia/Tokyo']).toContain(tz)
    if (tz === 'America/Chicago') {
      expect(new Date('2026-05-01').getDate()).toBe(30)
    }
    if (tz === 'Asia/Tokyo') {
      expect(new Date(2026, 4, 1).toISOString().slice(0, 10)).toBe('2026-04-30')
    }
  })

  it('round-trips a calendar day without shifting it', () => {
    expect(
      calendarDateFromLocalDate(localDateFromCalendarDate('2026-05-01')),
    ).toBe('2026-05-01')
    expect(calendarDateFromLocalDate(new Date(2026, 4, 1))).toBe('2026-05-01')
    const local = localDateFromCalendarDate('2026-05-01')
    expect(local.getFullYear()).toBe(2026)
    expect(local.getMonth()).toBe(4)
    expect(local.getDate()).toBe(1)
  })

  it('counts whole local calendar days', () => {
    expect(
      calendarDaysUntil('2026-06-10', new Date(2026, 5, 10, 23, 0, 0)),
    ).toBe(0)
    expect(
      calendarDaysUntil('2026-06-01', new Date('2026-06-13T08:00:00Z')),
    ).toBe(12)
  })
})
