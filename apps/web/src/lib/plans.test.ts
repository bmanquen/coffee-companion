import { describe, expect, it } from 'vitest'
import { planLimits } from '@coffee-companion/api/lib/plan'
import type { GearResource, PlanId } from '@coffee-companion/api/lib/plan'
import { planFeatures, plans } from './plans'

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
})
