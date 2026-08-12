// The Plan catalogue: the identifiers, what each Plan allows, and how a limit
// is worded. Deliberately free of database access so the web app can import it
// and reason about limits before asking the server to refuse.

export type PlanId = 'free' | 'pro' | 'proPlus'

export type BillingPeriod = 'monthly' | 'annual'

// What a Plan costs, as the seller has it on record. The amount is in whole
// currency units — 4.99, not 499 — so nothing outside the billing module has to
// know how a payment provider stores money.
export type PlanPrice = {
  planId: PlanId
  period: BillingPeriod
  amount: number
  currency: string
}

const rank: Array<PlanId> = ['free', 'pro', 'proPlus']

export const planName: Record<PlanId, string> = {
  free: 'Free',
  pro: 'Pro',
  proPlus: 'Pro+',
}

// Whether a Plan can be bought. An unsellable Plan is the only kind that can
// receive Interest — the way to have a sellable one is to subscribe to it.
export const sellable: Record<PlanId, boolean> = {
  free: true,
  pro: true,
  proPlus: false,
}

export type GearResource = 'grinders' | 'brewingDevices'

// null is unlimited.
export type GearLimits = Record<GearResource, number | null>

export const planLimits: Record<PlanId, GearLimits> = {
  free: { grinders: 1, brewingDevices: 3 },
  pro: { grinders: null, brewingDevices: null },
  proPlus: { grinders: null, brewingDevices: null },
}

// How many Coffees a Plan keeps readable, most recently brewed first. null is
// the whole library.
export const shelfSizes: Record<PlanId, number | null> = {
  free: 5,
  pro: null,
  proPlus: null,
}

const gearLabel: Record<GearResource, { one: string; many: string }> = {
  grinders: { one: 'Grinder', many: 'Grinders' },
  brewingDevices: { one: 'Brewing Device', many: 'Brewing Devices' },
}

// Reads a Plan identifier back out of a store that lowercases what it is
// given, so proPlus comes back as proplus. Anything unrecognised is undefined
// rather than Free, so a caller has to decide what an unknown Plan means.
export function planIdFrom(value: string): PlanId | undefined {
  return rank.find((planId) => planId.toLowerCase() === value.toLowerCase())
}

export function mostGenerous(plans: Array<PlanId>): PlanId {
  return plans.reduce<PlanId>(
    (best, plan) => (rank.indexOf(plan) > rank.indexOf(best) ? plan : best),
    'free',
  )
}

// How a Plan's equipment limit is worded, wherever it is said — the server's
// refusal and the app's warning before the user reaches it. Null when the Plan
// holds as much as the user likes.
export function gearLimitSentence(
  plan: PlanId,
  resource: GearResource,
): string | null {
  const limit = planLimits[plan][resource]
  if (limit === null) return null

  const label = limit === 1 ? gearLabel[resource].one : gearLabel[resource].many
  const upgrade = plan === 'free' ? ' Subscribe to add more.' : ''
  return `${planName[plan]} holds ${limit} ${label}.${upgrade}`
}
