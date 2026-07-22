import { describe, expect, it } from 'vitest'
import { isDashboardMethod, mostRecentMethod, resolveSelectedMethod } from './methods'

// Small helper: a feed entry with a single brew at the given ISO time.
function at(iso: string) {
  return [{ createdAt: new Date(iso) }]
}

describe('mostRecentMethod', () => {
  it('picks the method whose newest brew is the most recent across all feeds', () => {
    expect(
      mostRecentMethod([
        { method: 'espresso', brews: at('2026-06-01T08:00:00Z') },
        { method: 'pourover', brews: at('2026-06-10T08:00:00Z') },
        { method: 'frenchpress', brews: [] },
        { method: 'aeropress', brews: at('2026-06-05T08:00:00Z') },
        { method: 'coldbrew', brews: [] },
      ]),
    ).toBe('pourover')
  })

  it('falls back to espresso when no feed has any brews', () => {
    expect(
      mostRecentMethod([
        { method: 'espresso', brews: [] },
        { method: 'pourover', brews: [] },
        { method: 'frenchpress', brews: [] },
        { method: 'aeropress', brews: [] },
        { method: 'coldbrew', brews: [] },
      ]),
    ).toBe('espresso')
  })

  it('compares only each feed’s newest (first) brew, since feeds are newest-first', () => {
    // Cold brew's first entry is newest; a later, older-dated entry must not win.
    expect(
      mostRecentMethod([
        { method: 'espresso', brews: at('2026-06-02T08:00:00Z') },
        {
          method: 'coldbrew',
          brews: [
            { createdAt: new Date('2026-06-09T08:00:00Z') },
            { createdAt: new Date('2026-06-01T08:00:00Z') },
          ],
        },
      ]),
    ).toBe('coldbrew')
  })

  it('resolves ties toward the earlier feed in the list (espresso first)', () => {
    expect(
      mostRecentMethod([
        { method: 'espresso', brews: at('2026-06-07T08:00:00Z') },
        { method: 'aeropress', brews: at('2026-06-07T08:00:00Z') },
      ]),
    ).toBe('espresso')
  })
})

describe('isDashboardMethod', () => {
  it('accepts each known method value', () => {
    for (const value of [
      'espresso',
      'pourover',
      'frenchpress',
      'aeropress',
      'coldbrew',
    ]) {
      expect(isDashboardMethod(value)).toBe(true)
    }
  })

  it('rejects unknown and empty values, and undefined', () => {
    expect(isDashboardMethod('mokapot')).toBe(false)
    expect(isDashboardMethod('')).toBe(false)
    expect(isDashboardMethod(undefined)).toBe(false)
  })
})

describe('resolveSelectedMethod', () => {
  const feeds = [
    { method: 'espresso' as const, brews: at('2026-06-01T08:00:00Z') },
    { method: 'pourover' as const, brews: at('2026-06-10T08:00:00Z') },
    { method: 'aeropress' as const, brews: at('2026-06-05T08:00:00Z') },
  ]

  it('honours a valid param regardless of recency', () => {
    // pourover is the most-recent, but the param wins.
    expect(resolveSelectedMethod('aeropress', feeds)).toBe('aeropress')
  })

  it('defers to the most-recent method when the param is absent', () => {
    expect(resolveSelectedMethod(undefined, feeds)).toBe('pourover')
  })

  it('defers to the most-recent method when the param is invalid', () => {
    expect(resolveSelectedMethod('mokapot', feeds)).toBe('pourover')
    expect(resolveSelectedMethod('', feeds)).toBe('pourover')
  })

  it('falls back to espresso when there are no brews and no param', () => {
    expect(
      resolveSelectedMethod(undefined, [
        { method: 'espresso', brews: [] },
        { method: 'pourover', brews: [] },
      ]),
    ).toBe('espresso')
  })
})
