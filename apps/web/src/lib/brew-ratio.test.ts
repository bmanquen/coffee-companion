import { describe, expect, it } from 'vitest'
import { brewRatio, formatBrewRatio, isDialedIn } from './brew-ratio'

describe('brewRatio', () => {
  it('computes yield / dose', () => {
    expect(brewRatio('18', '36')).toBe(2)
    expect(brewRatio('18', '27')).toBe(1.5)
  })

  it('handles decimal strings', () => {
    expect(brewRatio('18', '36.5')).toBeCloseTo(2.0277, 3)
  })

  it('returns null when dose or yield is missing', () => {
    expect(brewRatio(null, '36')).toBeNull()
    expect(brewRatio('18', null)).toBeNull()
    expect(brewRatio(undefined, undefined)).toBeNull()
    expect(brewRatio('', '36')).toBeNull()
  })
})

describe('formatBrewRatio', () => {
  it('formats as 1:N.N', () => {
    expect(formatBrewRatio('18', '36')).toBe('1:2.0')
    expect(formatBrewRatio('18', '27')).toBe('1:1.5')
  })

  it('returns "-" when dose or yield is missing', () => {
    expect(formatBrewRatio(null, '36')).toBe('-')
    expect(formatBrewRatio('18', null)).toBe('-')
  })
})

describe('isDialedIn', () => {
  it('is true when the shot is its coffee’s dialed-in shot', () => {
    expect(
      isDialedIn({ id: 'shot-1', coffee: { dialedInShotId: 'shot-1' } }),
    ).toBe(true)
  })

  it('is false otherwise', () => {
    expect(
      isDialedIn({ id: 'shot-1', coffee: { dialedInShotId: 'shot-2' } }),
    ).toBe(false)
    expect(isDialedIn({ id: 'shot-1', coffee: { dialedInShotId: null } })).toBe(
      false,
    )
  })
})
