import { z } from 'zod'

// A calendar day with no time or timezone. Stored and transported as
// YYYY-MM-DD. `new Date('YYYY-MM-DD')` is UTC midnight (rolls back behind UTC);
// `toISOString()` / UTC getters on local midnight roll back ahead of UTC.
export const calendarDateSchema = z.iso.date()
export type CalendarDate = z.infer<typeof calendarDateSchema>

function parts(value: string): [number, number, number] {
  const [year, month, day] = value.split('-').map(Number)
  return [year, month, day]
}

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
  const [year, month, day] = parts(from)
  // Civil Y-M-D through UTC so a 23- or 25-hour local day still counts as one.
  return (
    (Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()) -
      Date.UTC(year, month - 1, day)) /
    86_400_000
  )
}
