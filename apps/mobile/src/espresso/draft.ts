import { isCalendarDate } from '@coffee-companion/api/lib/calendar-date'
import { formatBrewRatio } from '@coffee-companion/brew-display'
import {
  ENTER_A_GRIND_SETTING,
  ENTER_A_NUMBER,
  MUST_BE_A_NUMBER,
  MUST_BE_A_WHOLE_NUMBER,
  SEALED_SHOT,
  SELECT_COFFEE_ERROR,
  SELECT_DEVICE_ERROR,
  SELECT_GRINDER_ERROR,
  USE_CALENDAR_DATE,
} from './copy'
import type { ShotCreate, ShotRow } from './types'

export type ShotDraft = {
  coffeeId: string
  grinderId: string
  brewingDeviceId: string
  roastDate: string
  dose: string
  yield: string
  time: string
  grindSetting: string
  notes: string
}

export type FieldErrors = Partial<Record<keyof ShotDraft, string>>

export type ParseResult =
  | { ok: true; value: ShotCreate }
  | { ok: false; errors: FieldErrors }

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/
const WHOLE_NUMBER_PATTERN = /^-?\d+$/
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function emptyShotDraft(): ShotDraft {
  return {
    coffeeId: '',
    grinderId: '',
    brewingDeviceId: '',
    roastDate: '',
    dose: '',
    yield: '',
    time: '',
    grindSetting: '',
    notes: '',
  }
}

export function parseShotDraft(draft: ShotDraft): ParseResult {
  const errors: FieldErrors = {}

  if (!UUID_PATTERN.test(draft.coffeeId)) {
    errors.coffeeId = SELECT_COFFEE_ERROR
  }
  if (!UUID_PATTERN.test(draft.grinderId)) {
    errors.grinderId = SELECT_GRINDER_ERROR
  }
  if (!UUID_PATTERN.test(draft.brewingDeviceId)) {
    errors.brewingDeviceId = SELECT_DEVICE_ERROR
  }

  if (draft.dose.length === 0) {
    errors.dose = ENTER_A_NUMBER
  } else if (!DECIMAL_PATTERN.test(draft.dose)) {
    errors.dose = MUST_BE_A_NUMBER
  }

  if (draft.yield.length === 0) {
    errors.yield = ENTER_A_NUMBER
  } else if (!DECIMAL_PATTERN.test(draft.yield)) {
    errors.yield = MUST_BE_A_NUMBER
  }

  if (draft.time.length === 0) {
    errors.time = ENTER_A_NUMBER
  } else if (!WHOLE_NUMBER_PATTERN.test(draft.time)) {
    errors.time = MUST_BE_A_WHOLE_NUMBER
  }

  if (draft.grindSetting.length === 0) {
    errors.grindSetting = ENTER_A_GRIND_SETTING
  }

  let roastDate: string | null = null
  if (draft.roastDate.length > 0) {
    if (
      !CALENDAR_DATE_PATTERN.test(draft.roastDate) ||
      !isCalendarDate(draft.roastDate)
    ) {
      errors.roastDate = USE_CALENDAR_DATE
    } else {
      roastDate = draft.roastDate
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    value: {
      coffeeId: draft.coffeeId,
      grinderId: draft.grinderId,
      brewingDeviceId: draft.brewingDeviceId,
      roastDate,
      dose: draft.dose,
      yield: draft.yield,
      time: Number(draft.time),
      grindSetting: draft.grindSetting,
      notes: draft.notes.length > 0 ? draft.notes : null,
    },
  }
}

export function applyCoffeePrefill(
  draft: ShotDraft,
  coffeeId: string,
  shots: Array<ShotRow>,
): ShotDraft {
  const latest = shots.find((shot) => shot.coffeeId === coffeeId && !shot.sealed)
  if (!latest?.grinderId || !latest.brewingDeviceId) {
    return coffeeId === draft.coffeeId
      ? draft
      : { ...draft, coffeeId, roastDate: '' }
  }
  return {
    ...draft,
    coffeeId,
    grinderId: latest.grinderId,
    brewingDeviceId: latest.brewingDeviceId,
    roastDate: latest.roastDate ?? '',
  }
}

export function shotSummary(shot: ShotRow): string {
  if (shot.sealed) return SEALED_SHOT
  const parts: Array<string> = []
  if (shot.grindSetting) parts.push(`Grind ${shot.grindSetting}`)
  if (shot.dose) parts.push(`Dose ${shot.dose}g`)
  if (shot.yield) parts.push(`Yield ${shot.yield}g`)
  const ratio = formatBrewRatio(shot.dose, shot.yield)
  if (ratio) parts.push(`Ratio ${ratio}`)
  if (shot.time != null) parts.push(`Time ${shot.time}s`)
  return parts.join(' · ')
}
