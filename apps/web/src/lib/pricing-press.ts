// A call to action pressed before signing in, and the link that carries it
// across the trip to the identity provider. The writing and the reading live
// together so they cannot drift: a rename that breaks one breaks the other.

import { isBillingPeriod, isPlanId } from './plans'
import type { BillingPeriod, PlanId } from './plans'

export type PricingPress = {
  interest?: PlanId
  checkout?: PlanId
  period?: BillingPeriod
}

export function returnLink(press: PricingPress): string {
  const search = new URLSearchParams(Object.entries(press))
  return search.size ? `/pricing?${search}` : '/pricing'
}

export function pressFromSearch(search: Record<string, unknown>): PricingPress {
  return {
    ...(isPlanId(search.interest) ? { interest: search.interest } : {}),
    ...(isPlanId(search.checkout) ? { checkout: search.checkout } : {}),
    ...(isBillingPeriod(search.period) ? { period: search.period } : {}),
  }
}
