import { describe, expect, it } from 'vitest'
import { planLimits, sellable } from '@coffee-companion/api/lib/plan'
import { formatPrice, planFeatures, plans, priceFor } from './plans'
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
