import { describe, expect, it } from 'vitest'
import {
  calendarDateFromLocalDate,
  calendarDateSchema,
  calendarDaysUntil,
  localDateFromCalendarDate,
} from './calendar-date'

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
  it('runs behind UTC so a date-only Date parse would roll back a day', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
      'America/Chicago',
    )
    expect(new Date('2026-05-01').getDate()).toBe(30)
  })

  it('round-trips a calendar day without shifting it', () => {
    expect(
      calendarDateFromLocalDate(localDateFromCalendarDate('2026-05-01')),
    ).toBe('2026-05-01')
    const local = localDateFromCalendarDate('2026-05-01')
    expect(local.getFullYear()).toBe(2026)
    expect(local.getMonth()).toBe(4)
    expect(local.getDate()).toBe(1)
  })

  it('counts whole local calendar days', () => {
    expect(
      calendarDaysUntil('2026-06-10', new Date('2026-06-11T04:00:00Z')),
    ).toBe(0)
    expect(
      calendarDaysUntil('2026-06-01', new Date('2026-06-13T08:00:00Z')),
    ).toBe(12)
  })
})
