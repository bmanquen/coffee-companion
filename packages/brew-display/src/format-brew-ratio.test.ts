import { describe, expect, it } from 'vitest'
import { formatBrewRatio } from './format-brew-ratio'

describe('formatBrewRatio', () => {
  it('is yield or water divided by dose, as 1:x', () => {
    expect(formatBrewRatio('18', '36')).toBe('1:2')
    expect(formatBrewRatio('18', '45')).toBe('1:2.5')
    expect(formatBrewRatio('15', '220')).toBe('1:14.67')
    expect(formatBrewRatio('18', '300')).toBe('1:16.67')
    expect(formatBrewRatio('50', '500')).toBe('1:10')
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
  })
})
