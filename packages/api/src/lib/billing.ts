// Everything the payment provider needs to know, and the only module that
// knows it. Price identifiers, the secret key and the provider's own name live
// here; outside this file a Plan is only ever one of the app's own Plan
// identifiers (ADR-0006).

import Stripe from 'stripe'
import { sellable } from './plan'
import type { BillingPeriod, PlanId } from './plan'

// The Plans a customer can hand over money for. Free is sellable in the
// catalogue's sense — it has a call to action — but nothing is charged for it,
// so it carries no price.
const purchasable = (Object.keys(sellable) as Array<PlanId>).filter(
  (planId) => sellable[planId] && planId !== 'free',
)

// STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_PLUS_ANNUAL, and so on. Derived
// rather than listed so making a Plan sellable needs no change here.
function priceVar(planId: PlanId, period: BillingPeriod): string {
  const plan = planId.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()
  return `STRIPE_PRICE_${plan}_${period.toUpperCase()}`
}

export interface BillingPlan {
  name: PlanId
  priceId: string
  annualDiscountPriceId: string
}

export interface BillingConfig {
  client: Stripe
  webhookSecret: string
  plans: Array<BillingPlan>
}

// Null when billing is switched off entirely, which is how a fresh clone, the
// unit tests and CI all run. Anything short of a complete configuration throws
// instead, and throws at import time — a half-configured deployment has to fail
// on the way up, not under the first customer to press Subscribe.
export function billingConfig(): BillingConfig | null {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) return null

  const problems: Array<string> = []

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) problems.push('STRIPE_WEBHOOK_SECRET is not set')

  const priceId = (planId: PlanId, period: BillingPeriod): string => {
    const name = priceVar(planId, period)
    const value = process.env[name]
    if (!value) problems.push(`${name} is not set`)
    else if (!/^price_[A-Za-z0-9]+$/.test(value)) {
      problems.push(`${name} is not a price identifier (got "${value}")`)
    }
    return value ?? ''
  }

  const plans = purchasable.map((planId) => ({
    name: planId,
    priceId: priceId(planId, 'monthly'),
    annualDiscountPriceId: priceId(planId, 'annual'),
  }))

  if (problems.length) {
    throw new Error(
      [
        'Billing is configured, but not completely:',
        ...problems.map((problem) => `  - ${problem}`),
        'Unset STRIPE_SECRET_KEY to run without billing.',
      ].join('\n'),
    )
  }

  return {
    // No apiVersion: the SDK's default is the version its own types were
    // generated for, and a string pinned here is how those two drift apart.
    // The version webhook events arrive in is a separate thing, set on the
    // endpoint — see docs/runbooks/stripe-managed-payments.md.
    client: new Stripe(secretKey),
    webhookSecret: webhookSecret as string,
    plans,
  }
}

// Makes Stripe the merchant of record for this purchase, so it calculates,
// collects and remits the buyer's sales tax, VAT or GST (ADR-0006).
export function managedPaymentsParams(): Stripe.Checkout.SessionCreateParams {
  return {
    managed_payments: { enabled: true },
  }
}
