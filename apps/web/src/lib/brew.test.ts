import { describe, expect, it } from 'vitest'
import {
  daysOffRoast,
  formatBrewRatio,
  formatBrewSeconds,
  formatSteepMinutes,
} from './brew'

describe('daysOffRoast', () => {
  it('counts whole days from roast date to brew time', () => {
    expect(daysOffRoast('2026-06-01', new Date('2026-06-13T08:00:00Z'))).toBe(12)
  })

  it('is null when there is no roast date', () => {
    expect(daysOffRoast(null, new Date('2026-06-13T08:00:00Z'))).toBeNull()
  })

  it('is 0 on the roast day', () => {
    expect(daysOffRoast('2026-06-10', new Date('2026-06-10T12:00:00Z'))).toBe(0)
  })

  it('clamps to 0 when brewed before the roast date', () => {
    expect(daysOffRoast('2026-06-10', new Date('2026-06-01T08:00:00Z'))).toBe(0)
  })
})

describe('formatSteepMinutes', () => {
  it('renders whole hours without minutes', () => {
    expect(formatSteepMinutes(1080)).toBe('18h')
  })

  it('renders hours and minutes together', () => {
    expect(formatSteepMinutes(90)).toBe('1h 30m')
  })

  it('renders sub-hour steeps as minutes only', () => {
    expect(formatSteepMinutes(45)).toBe('45m')
  })

  it('renders a zero steep as minutes, not seconds', () => {
    expect(formatSteepMinutes(0)).toBe('0m')
  })

  it('is a dash when unknown', () => {
    expect(formatSteepMinutes(null)).toBe('-')
  })
})

describe('formatBrewSeconds', () => {
  it('renders minutes and seconds together', () => {
    expect(formatBrewSeconds(165)).toBe('2m 45s')
  })

  it('renders whole minutes without seconds', () => {
    expect(formatBrewSeconds(240)).toBe('4m')
  })

  it('renders sub-minute times as seconds only', () => {
    expect(formatBrewSeconds(45)).toBe('45s')
  })

  it('renders a zero brew time as seconds', () => {
    expect(formatBrewSeconds(0)).toBe('0s')
  })

  it('is a dash when unknown', () => {
    expect(formatBrewSeconds(null)).toBe('-')
  })
})

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
