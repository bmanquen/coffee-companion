import { describe, expect, it } from 'vitest'
import { COLD_BREW_DEVICE_TYPE, isColdBrewDevice } from './cold-brew'

describe('isColdBrewDevice', () => {
  it('is true only for the cold brew device type', () => {
    expect(isColdBrewDevice({ type: { name: COLD_BREW_DEVICE_TYPE } })).toBe(
      true,
    )
    expect(isColdBrewDevice({ type: { name: 'French Press' } })).toBe(false)
  })
})
