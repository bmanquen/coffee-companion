import {
  emptyShotDraft,
  parseShotDraft,
  shotSummary,
} from './draft'
import { SEALED_SHOT } from './copy'
import type { ShotRow } from './types'

const COFFEE = '00000000-0000-4000-8000-000000000001'
const GRINDER = '00000000-0000-4000-8000-000000000003'
const DEVICE = '00000000-0000-4000-8000-000000000005'

const valid = {
  ...emptyShotDraft(),
  coffeeId: COFFEE,
  grinderId: GRINDER,
  brewingDeviceId: DEVICE,
  dose: '18',
  yield: '36',
  time: '30',
  grindSetting: '1.5',
}

function shot(overrides: Partial<ShotRow> = {}): ShotRow {
  return {
    id: 'shot-1',
    coffeeId: COFFEE,
    coffeeName: 'Ethiopia Guji',
    grinderId: GRINDER,
    brewingDeviceId: DEVICE,
    roastDate: '2026-05-01',
    grindSetting: '21',
    dose: '18',
    yield: '36',
    time: 27,
    sealed: false,
    ...overrides,
  }
}

describe('parseShotDraft', () => {
  it('accepts a complete shot and sends time as a number', () => {
    expect(parseShotDraft(valid)).toEqual({
      ok: true,
      value: {
        coffeeId: COFFEE,
        grinderId: GRINDER,
        brewingDeviceId: DEVICE,
        roastDate: null,
        dose: '18',
        yield: '36',
        time: 30,
        grindSetting: '1.5',
        notes: null,
      },
    })
  })

  it('keeps roast date as a YYYY-MM-DD string', () => {
    const parsed = parseShotDraft({ ...valid, roastDate: '2026-05-01' })
    expect(parsed).toEqual({
      ok: true,
      value: expect.objectContaining({ roastDate: '2026-05-01' }),
    })
  })

  it('names empty settings fields', () => {
    const parsed = parseShotDraft(emptyShotDraft())
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.errors).toEqual({
      coffeeId: 'Select a coffee',
      grinderId: 'Select a grinder',
      brewingDeviceId: 'Select a brewing device',
      dose: 'Enter a number',
      yield: 'Enter a number',
      time: 'Enter a number',
      grindSetting: 'Enter a grind setting',
    })
  })

  it('names an invalid dose', () => {
    const parsed = parseShotDraft({ ...valid, dose: 'abc' })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.errors).toEqual({ dose: 'Must be a number' })
  })

  it('rejects a negative time and accepts zero', () => {
    const negative = parseShotDraft({ ...valid, time: '-10' })
    expect(negative.ok).toBe(false)
    if (negative.ok) return
    expect(negative.errors).toEqual({ time: 'Must be a whole number' })

    expect(parseShotDraft({ ...valid, time: '0' })).toEqual({
      ok: true,
      value: expect.objectContaining({ time: 0 }),
    })
  })

  it('rejects a timestamp roast date', () => {
    const parsed = parseShotDraft({
      ...valid,
      roastDate: '2026-05-01T00:00:00.000Z',
    })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.errors).toEqual({ roastDate: 'Use YYYY-MM-DD' })
  })

  it('rejects a roast date that is not a real calendar day', () => {
    const parsed = parseShotDraft({ ...valid, roastDate: '2026-02-30' })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.errors).toEqual({ roastDate: 'Use YYYY-MM-DD' })
  })
})

describe('shotSummary', () => {
  it('is the dial-in line for a readable shot', () => {
    expect(shotSummary(shot())).toBe(
      'Grind 21 · Dose 18g · Yield 36g · Ratio 1:2 · Time 27s',
    )
  })

  it('withholds settings on a sealed shot', () => {
    expect(shotSummary(shot({ sealed: true }))).toBe(SEALED_SHOT)
  })
})
