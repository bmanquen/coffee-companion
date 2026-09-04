import { describe, expect, it } from 'vitest'
import { planLimits, sellable } from '@coffee-companion/api/lib/plan'
import {
  annualSaving,
  formatPrice,
  planFeatures,
  plans,
  priceFor,
} from './plans'
import type { GearResource, PlanId } from '@coffee-companion/api/lib/plan'
import type { Plan } from './plans'

// The catalogue is what a visitor is sold; planLimits is what the server
// enforces. These are separate sources on purpose — one is prose, the other is
// numbers — so this pins them together. A limit changed on the server without
// the pricing page changing is a promise the product stops keeping.
const rowFor = (label: string) => {
  const row = planFeatures.find((feature) => feature.label === label)
  if (!row) throw new Error(`No "${label}" row in the Plan catalogue`)
  return row
}

const advertised = (label: string, plan: PlanId) => rowFor(label).values[plan]

const enforced = (plan: PlanId, resource: GearResource) => {
  const limit = planLimits[plan][resource]
  return limit === null ? 'Unlimited' : String(limit)
}

describe('the Plan catalogue matches what the server enforces', () => {
  const gearRows: Array<[string, GearResource]> = [
    ['Grinders', 'grinders'],
    ['Brewing Devices', 'brewingDevices'],
  ]

  it.each(gearRows)('advertises the enforced %s limit', (label, resource) => {
    for (const plan of plans) {
      expect(advertised(label, plan.id)).toBe(enforced(plan.id, resource))
    }
  })

  it('covers every Plan in the catalogue', () => {
    for (const plan of plans) {
      expect(planLimits[plan.id]).toBeDefined()
    }
  })

  // The card offers a purchase path on exactly the Plans the server will sell,
  // and registers interest on exactly the ones it refuses to sell.
  it('offers to sell exactly what the server sells', () => {
    for (const plan of plans) {
      expect(plan.sellable).toBe(sellable[plan.id])
    }
  })
})

describe('priceFor', () => {
  const pro = plans.find((plan) => plan.id === 'pro') as Plan

  it('quotes what the seller has on record', () => {
    expect(
      priceFor(pro, 'annual', [
        { planId: 'pro', period: 'annual', amount: 39.99, currency: 'GBP' },
      ]),
    ).toEqual({ amount: 39.99, currency: 'GBP' })
  })

  it('quotes the catalogue when the seller has no price for that period', () => {
    expect(
      priceFor(pro, 'annual', [
        { planId: 'pro', period: 'monthly', amount: 3.99, currency: 'GBP' },
      ]),
    ).toEqual({ amount: pro.price.annual, currency: 'USD' })
  })

  it('quotes the catalogue when the seller has no prices at all', () => {
    expect(priceFor(pro, 'monthly')).toEqual({
      amount: pro.price.monthly,
      currency: 'USD',
    })
  })
})

describe('formatPrice', () => {
  it('drops the pence from a whole amount', () => {
    expect(formatPrice(0)).toBe('$0')
  })

  it('keeps them where there are any', () => {
    expect(formatPrice(4.99)).toBe('$4.99')
  })

  it('shows the amount in the currency it is charged in', () => {
    expect(formatPrice(39.99, 'GBP')).toBe('£39.99')
  })
})

// The toggle defaults to annual because it is cheaper (ADR-0006), and the page
// has to show by how much rather than leave the visitor to do the arithmetic.
describe('annualSaving', () => {
  const pro = plans.find((plan) => plan.id === 'pro') as Plan
  const free = plans.find((plan) => plan.id === 'free') as Plan

  it('is the share of a year of monthly payments that annual does not charge', () => {
    // 12 × $4.99 is $59.88; $44.99 is 24.9% less, read as 25%.
    expect(annualSaving(pro)).toBe(25)
  })

  it('is worked out from the seller’s prices where there are any', () => {
    expect(
      annualSaving(pro, [
        { planId: 'pro', period: 'monthly', amount: 10, currency: 'USD' },
        { planId: 'pro', period: 'annual', amount: 100, currency: 'USD' },
      ]),
    ).toBe(17)
  })

  it('is nothing on a Plan that costs nothing', () => {
    expect(annualSaving(free)).toBeNull()
  })

  it('is nothing when annual is not the cheaper period', () => {
    expect(
      annualSaving(pro, [
        { planId: 'pro', period: 'monthly', amount: 4, currency: 'USD' },
        { planId: 'pro', period: 'annual', amount: 48, currency: 'USD' },
      ]),
    ).toBeNull()
  })

  // A monthly price in one currency and an annual in another is not a
  // comparison, and a percentage of it would be a claim about exchange rates.
  it('is nothing when the two periods are not priced in one currency', () => {
    expect(
      annualSaving(pro, [
        { planId: 'pro', period: 'monthly', amount: 3.99, currency: 'GBP' },
      ]),
    ).toBeNull()
  })
})
