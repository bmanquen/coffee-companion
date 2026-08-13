import { describe, expect, it } from 'vitest'
import { pressFromSearch, returnLink } from './pricing-press'
import type { PricingPress } from './pricing-press'

// The two halves of one round trip: the link is written before the visitor
// leaves for Google, and read once they come back. They are exercised together
// here because that is the only way they fail together — apart, either half can
// be renamed and the press is silently lost.
const roundTrip = (press: PricingPress): PricingPress =>
  pressFromSearch(
    Object.fromEntries(
      new URL(returnLink(press), 'https://coffee.example').searchParams,
    ),
  )

describe('a press carried through sign-in', () => {
  it('comes back to the pricing page as what was pressed', () => {
    expect(returnLink({ checkout: 'pro', period: 'annual' })).toMatch(
      /^\/pricing\?/,
    )
    expect(roundTrip({ checkout: 'pro', period: 'annual' })).toEqual({
      checkout: 'pro',
      period: 'annual',
    })
    expect(roundTrip({ interest: 'proPlus' })).toEqual({ interest: 'proPlus' })
    expect(returnLink({})).toBe('/pricing')
    expect(roundTrip({})).toEqual({})
  })

  // The link is the pricing page's own return address, not a general-purpose
  // one: only a press survives it, so nothing hand-added can be acted on.
  it('carries back nothing but a Plan that exists on a period that is billed', () => {
    expect(
      pressFromSearch({
        checkout: 'enterprise',
        interest: 'enterprise',
        period: 'weekly',
        redirect: 'https://elsewhere.example',
      }),
    ).toEqual({})
    expect(pressFromSearch({ checkout: 'pro', period: 'weekly' })).toEqual({
      checkout: 'pro',
    })
  })
})
