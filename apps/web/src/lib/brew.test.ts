import { describe, expect, it } from 'vitest'
import { daysOffRoast, formatSteepMinutes } from './brew'

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

  it('is a dash when unknown', () => {
    expect(formatSteepMinutes(null)).toBe('-')
  })
})
