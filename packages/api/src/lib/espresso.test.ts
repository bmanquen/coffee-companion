import { describe, expect, it } from 'vitest'
import { ESPRESSO_DEVICE_TYPE, isEspressoDevice } from './espresso'

describe('isEspressoDevice', () => {
  it('is true only for the espresso device type', () => {
    expect(isEspressoDevice({ type: { name: ESPRESSO_DEVICE_TYPE } })).toBe(true)
    expect(isEspressoDevice({ type: { name: 'Pour Over' } })).toBe(false)
  })
})
