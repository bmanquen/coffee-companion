import { z } from 'zod'

// A calendar day with no time or timezone. Stored and transported as
// YYYY-MM-DD; never parsed with `new Date('YYYY-MM-DD')`, which is UTC midnight
// and rolls back a day in timezones behind UTC.
export const calendarDateSchema = z.iso.date()
export type CalendarDate = z.infer<typeof calendarDateSchema>

function parts(value: string): [number, number, number] {
  const [year, month, day] = value.split('-').map(Number)
  return [year, month, day]
}

// react-day-picker speaks Date. Build local midnight of that calendar day so
// display and selection stay on the same Y-M-D the string names.
export function localDateFromCalendarDate(value: string): Date {
  const [year, month, day] = parts(value)
  return new Date(year, month - 1, day)
}

export function calendarDateFromLocalDate(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function calendarDaysUntil(from: string, at: Date): number {
  const start = localDateFromCalendarDate(from)
  const end = new Date(at.getFullYear(), at.getMonth(), at.getDate())
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}
