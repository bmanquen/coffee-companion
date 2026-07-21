import { describe, expect, it } from 'vitest'
import { mostRecentMethod } from './methods'

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
