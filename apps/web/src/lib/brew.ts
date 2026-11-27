import { calendarDaysUntil } from '@coffee-companion/api/lib/calendar-date'

// General brew helpers, method-agnostic (roast date applies to any brew, not
// just espresso).

// Whole local calendar days between when the beans were roasted and when a brew
// was pulled — a fixed fact per brew (roast date → brew time), not "days since
// roast until now". Null when the brew has no roast date. This freshness
// number, not the raw date, is what matters for dialing in. Pure so it can be
// unit tested.
export function daysOffRoast(
  roastDate: string | null,
  brewedAt: Date,
): number | null {
  if (!roastDate) return null
  const days = calendarDaysUntil(roastDate, brewedAt)
  return days < 0 ? 0 : days
}

export {
  formatBrewRatio,
  formatBrewSeconds,
  formatSteepMinutes,
} from '@coffee-companion/brew-display'
