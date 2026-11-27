import { describe, expect, it } from 'vitest'
import { applyCoffeePrefill } from './coffee-prefill'

const COFFEE = 'coffee-1'
const GRINDER = 'grinder-1'
const DEVICE = 'device-1'

const empty = { coffeeId: '', grinderId: '', brewingDeviceId: '', roastDate: '' }
const latest = {
  grinderId: GRINDER,
  brewingDeviceId: DEVICE,
  roastDate: '2026-05-01',
}

describe('applyCoffeePrefill', () => {
  it('carries grinder, device, and roast date from the latest shot', () => {
    expect(applyCoffeePrefill(empty, COFFEE, latest, {}, '')).toEqual({
      coffeeId: COFFEE,
      grinderId: GRINDER,
      brewingDeviceId: DEVICE,
      roastDate: '2026-05-01',
    })
  })

  it('clears the roast date when the coffee has no latest shot', () => {
    const draft = { ...empty, coffeeId: COFFEE, roastDate: '2026-05-01' }
    expect(applyCoffeePrefill(draft, 'coffee-2', null, {}, '')).toEqual({
      ...empty,
      coffeeId: 'coffee-2',
    })
    expect(
      applyCoffeePrefill({ ...draft, roastDate: null }, COFFEE, null, {}, null)
        .roastDate,
    ).toBeNull()
  })

  it('keeps grinder, device, and roast date the user already chose', () => {
    const draft = {
      coffeeId: COFFEE,
      grinderId: 'keep-grinder',
      brewingDeviceId: 'keep-device',
      roastDate: '2026-06-15',
    }
    const keep = { grinderId: true, brewingDeviceId: true, roastDate: true }
    expect(applyCoffeePrefill(draft, COFFEE, latest, keep, '')).toEqual(draft)
  })

  it('applies each kept field independently', () => {
    const draft = {
      ...empty,
      grinderId: 'typed-grinder',
      brewingDeviceId: 'typed-device',
      roastDate: '2026-06-15',
    }
    const next = applyCoffeePrefill(draft, COFFEE, latest, { grinderId: true }, '')
    expect(next.grinderId).toBe('typed-grinder')
    expect(next.brewingDeviceId).toBe(DEVICE)
    expect(next.roastDate).toBe('2026-05-01')
  })

  it('falls back only for a field the latest shot does not have', () => {
    const draft = { ...empty, grinderId: 'typed-grinder', roastDate: '2026-06-15' }
    const next = applyCoffeePrefill(
      draft,
      COFFEE,
      { ...latest, grinderId: null, roastDate: null },
      {},
      '',
    )
    expect(next.grinderId).toBe('typed-grinder')
    expect(next.brewingDeviceId).toBe(DEVICE)
    expect(next.roastDate).toBe('')
  })
})
