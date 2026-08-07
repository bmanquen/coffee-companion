// The Plan catalogue: what each Plan is called, what it costs, and how the
// Plans differ. This is the single source for the pricing page — nothing about
// a Plan is hardcoded into a component, so adding a Plan or making one sellable
// is a change here alone.
//
// Deliberately free of payment-provider concepts. There are no price IDs,
// product IDs or provider names anywhere in this module, and there must not be:
// which provider we settle on (Stripe versus a merchant of record) is still
// open, and the app's own Plan identifiers are what the rest of the codebase
// should ever see.

export type PlanId = 'free' | 'pro' | 'proPlus'

export type BillingPeriod = 'monthly' | 'annual'

export type Plan = {
  id: PlanId
  name: string
  tagline: string
  // US dollars per period, as advertised. Tax is not included; whether it is
  // added at checkout or absorbed depends on the provider decision still to be
  // made, so the page says so rather than implying a final figure.
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

// Renders $0 rather than "Free" so a price never collides with a Plan name —
// otherwise the Free card reads "Free / Free" and no test can tell the heading
// from the amount.
export function formatPrice(amount: number): string {
  return `$${amount.toFixed(2).replace(/\.00$/, '')}`
}

export function isPlanId(value: unknown): value is PlanId {
  return plans.some((plan) => plan.id === value)
}

export function priceSuffix(period: BillingPeriod): string {
  return period === 'monthly' ? '/month' : '/year'
}
