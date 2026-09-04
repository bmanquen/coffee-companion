// The Plan catalogue: what each Plan is called, what it costs, and how the
// Plans differ. This is the single source for the pricing page — nothing about
// a Plan is hardcoded into a component, so adding a Plan or making one sellable
// is a change here alone.
//
// Deliberately free of payment-provider concepts. There are no price IDs,
// product IDs or provider names anywhere in this module, and there must not be
// (ADR-0006) — the app's own Plan identifiers are what the rest of the codebase
// should ever see.

import type { BillingPeriod, PlanPrice } from '@coffee-companion/api/lib/plan'

export type PlanId = 'free' | 'pro' | 'proPlus'

export type { BillingPeriod, PlanPrice }

export type Plan = {
  id: PlanId
  name: string
  tagline: string
  // US dollars per period. Shown only where the seller has no price on record
  // — always for Free and Pro+, which are not purchasable. Tax is added at
  // checkout on top (ADR-0006), so the page says "excluding any tax".
  price: Record<BillingPeriod, number>
  // Whether this Plan can be bought today. Pro+ is shown in full but not
  // sellable: everything separating it from Pro is still unbuilt, so its call
  // to action registers interest instead of taking money.
  sellable: boolean
  cta: string
}

export type PlanFeature = {
  label: string
  // Marks a whole row as unbuilt. The row still shows its intended values, so
  // the roadmap is legible, but nobody can mistake it for something shipping.
  comingSoon?: boolean
  values: Record<PlanId, string>
}

export const plans: Array<Plan> = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Log everything. Keep your five most recent coffees.',
    price: { monthly: 0, annual: 0 },
    sellable: true,
    cta: 'Save your first brew',
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Your whole history, searchable, on as much gear as you own.',
    price: { monthly: 4.99, annual: 44.99 },
    sellable: true,
    cta: 'Subscribe',
  },
  {
    id: 'proPlus',
    name: 'Pro+',
    tagline: 'Everything in Pro, plus unlimited AI when it lands.',
    price: { monthly: 7.99, annual: 74.99 },
    sellable: false,
    cta: 'Join Waitlist',
  },
]

// Only what differs between Plans. Everything else is identical on all three —
// see planIncludes below.
export const planFeatures: Array<PlanFeature> = [
  {
    label: 'Brew history',
    values: {
      free: 'Your 5 most-recently-brewed coffees',
      pro: 'Everything',
      proPlus: 'Everything',
    },
  },
  {
    label: 'Search',
    values: {
      free: 'Coffee names and roasters',
      pro: 'Notes, origin, brews, dial-ins',
      proPlus: 'Notes, origin, brews, dial-ins',
    },
  },
  {
    label: 'Grinders',
    values: { free: '1', pro: 'Unlimited', proPlus: 'Unlimited' },
  },
  {
    label: 'Brewing Devices',
    values: { free: '3', pro: 'Unlimited', proPlus: 'Unlimited' },
  },
  {
    label: 'AI calls',
    comingSoon: true,
    values: {
      free: '5 lifetime',
      pro: '30 / month',
      proPlus: 'Unlimited',
    },
  },
]

// What every Plan gets, stated up front so the comparison table is read as a
// list of differences rather than a list of what Free lacks.
export const planIncludes: Array<string> = [
  'Unlimited coffees',
  'Unlimited brews',
  'Every brewing method',
  'Cross-device sync',
]

export const FALLBACK_CURRENCY = 'USD'

// What a Plan costs: the seller's own price where there is one, the
// catalogue's otherwise.
export function priceFor(
  plan: Plan,
  period: BillingPeriod,
  prices: Array<PlanPrice> = [],
): { amount: number; currency: string } {
  const onRecord = prices.find(
    (price) => price.planId === plan.id && price.period === period,
  )

  if (onRecord) return { amount: onRecord.amount, currency: onRecord.currency }

  return { amount: plan.price[period], currency: FALLBACK_CURRENCY }
}

// Null when there is no saving to state: two periods priced in different
// currencies, or one priced by the seller and the other by the catalogue,
// neither of which a percentage can honestly compare.
export function annualSavingPercent(
  plan: Plan,
  prices: Array<PlanPrice> = [],
): number | null {
  const sellerPrices = (period: BillingPeriod) =>
    prices.some((price) => price.planId === plan.id && price.period === period)
  if (sellerPrices('monthly') !== sellerPrices('annual')) return null

  const monthly = priceFor(plan, 'monthly', prices)
  const annual = priceFor(plan, 'annual', prices)
  if (monthly.currency !== annual.currency) return null

  const yearOfMonthly = monthly.amount * 12
  if (yearOfMonthly <= 0 || annual.amount >= yearOfMonthly) return null

  return Math.round((1 - annual.amount / yearOfMonthly) * 100)
}

// Renders $0 rather than "Free" so a price never collides with a Plan name —
// otherwise the Free card reads "Free / Free" and no test can tell the heading
// from the amount.
export function formatPrice(
  amount: number,
  currency: string = FALLBACK_CURRENCY,
): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency })
    .format(amount)
    .replace(/\.00$/, '')
}

export function isPlanId(value: unknown): value is PlanId {
  return plans.some((plan) => plan.id === value)
}

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return value === 'monthly' || value === 'annual'
}

export function isSellable(planId: PlanId): boolean {
  return plans.find((plan) => plan.id === planId)?.sellable ?? false
}

// Whether holding this Plan means paying for it. Free comes with signing up,
// so holding it is never being subscribed.
export function isPaid(planId: PlanId): boolean {
  return planId !== 'free'
}

export function priceSuffix(period: BillingPeriod): string {
  return period === 'monthly' ? '/month' : '/year'
}
