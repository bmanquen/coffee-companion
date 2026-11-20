import { describe, expect, it } from 'vitest'
import { formatBrewRatio } from './format-brew-ratio'

describe('formatBrewRatio', () => {
  it('is yield or water divided by dose, as 1:x', () => {
    expect(formatBrewRatio('18', '36')).toBe('1:2')
    expect(formatBrewRatio('18', '45')).toBe('1:2.5')
    expect(formatBrewRatio('15', '220')).toBe('1:14.67')
    expect(formatBrewRatio('18', '300')).toBe('1:16.67')
    expect(formatBrewRatio('50', '500')).toBe('1:10')
    // Exact half-hundredths round up, as the API's ratio search does, even
    // where the double sits just below (53.5 / 20 is 2.67499… in binary).
    expect(formatBrewRatio('20', '53.5')).toBe('1:2.68')
    expect(formatBrewRatio('20', '45.7')).toBe('1:2.29')
  })

  it('reads decimal strings the way the database stores grams', () => {
    expect(formatBrewRatio('18.0', '36.0')).toBe('1:2')
  })

  it('is null when dose is missing', () => {
    expect(formatBrewRatio(null, '36')).toBeNull()
    expect(formatBrewRatio('', '36')).toBeNull()
  })

  it('is null when the other weight is missing', () => {
    expect(formatBrewRatio('18', null)).toBeNull()
    expect(formatBrewRatio('18', '')).toBeNull()
  })

  it('does not divide by zero', () => {
    expect(formatBrewRatio('0', '36')).toBeNull()
    expect(formatBrewRatio(0, 36)).toBeNull()
  })

  it('does not round a tiny positive output to 1:0', () => {
    expect(formatBrewRatio('18', '0.05')).toBe('1:0.003')
    expect(formatBrewRatio('18', '0.05')).not.toBe('1:0')
    // Past six decimals too, in plain decimals rather than 1:5e-8.
    expect(formatBrewRatio('20', '0.0000004')).toBe('1:0.00000002')
    // 0.00000005 rounds up at the first decimal that is not zero.
    expect(formatBrewRatio('20', '0.000001')).toBe('1:0.0000001')
  })
})
