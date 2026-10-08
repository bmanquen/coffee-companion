import { describe, expect, it } from 'vitest'
import {
  brewMethods,
  brewsLogLocation,
  isBrewMethod,
  resolveBrewMethod,
} from './methods'

describe('brewMethods', () => {
  it('keeps the tab labels and order', () => {
    expect(brewMethods.map((m) => m.label)).toEqual([
      'Espresso',
      'Pour Over',
      'French Press',
      'AeroPress',
      'Cold Brew',
    ])
  })
})

describe('isBrewMethod', () => {
  it('accepts each known method value', () => {
    for (const value of [
      'espresso',
      'pourover',
      'frenchpress',
      'aeropress',
      'coldbrew',
    ]) {
      expect(isBrewMethod(value)).toBe(true)
    }
  })

  it('rejects unknown and empty values, and undefined', () => {
    expect(isBrewMethod('mokapot')).toBe(false)
    expect(isBrewMethod('')).toBe(false)
    expect(isBrewMethod(undefined)).toBe(false)
  })
})

describe('resolveBrewMethod', () => {
  it('honours a valid param', () => {
    expect(resolveBrewMethod('aeropress')).toBe('aeropress')
    expect(resolveBrewMethod('coldbrew')).toBe('coldbrew')
  })

  it('falls back to espresso when the param is absent or invalid', () => {
    expect(resolveBrewMethod(undefined)).toBe('espresso')
    expect(resolveBrewMethod('')).toBe('espresso')
    expect(resolveBrewMethod('mokapot')).toBe('espresso')
  })
})

describe('brewsLogLocation', () => {
  it('is a /brews location carrying the method search param', () => {
    expect(brewsLogLocation('aeropress')).toEqual({
      to: '/brews',
      search: { method: 'aeropress' },
    })
    expect(brewsLogLocation('espresso')).toEqual({
      to: '/brews',
      search: { method: 'espresso' },
    })
  })
})
