import { and, count, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { db } from '../db'
import { brewingDevices, grinders, planGrants, subscription } from '../db/schema'
import {
  gearLimitSentence,
  mostGenerous,
  planIdFrom,
  planLimits,
} from './plan'
import type { CurrentSubscription, GearResource, PlanId } from './plan'

const gearTable = {
  grinders,
  brewingDevices,
} as const

// A declined renewal is Stripe retrying a card, not an ending, and nothing may
// Seal while it can still be fixed (ADR-0008) — so this is a status in which a
// Subscription still confers its Plan.
const RETRYING = 'past_due'

const paidStatuses = ['active', 'trialing', RETRYING]

const paidSubscriptionsOf = (userId: string) =>
  db
    .select({
      plan: subscription.plan,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      periodEnd: subscription.periodEnd,
      cancelAt: subscription.cancelAt,
    })
    .from(subscription)
    .where(
      and(
        eq(subscription.referenceId, userId),
        inArray(subscription.status, paidStatuses),
      ),
    )

// A Grant and a Subscription are the two sources of a Plan, and the most
// generous of them wins — so a comp is never downgraded by billing state, and
// a paid Subscription is never downgraded by a lesser Grant.
//
// No role ever confers a Plan: a maintainer account has to be able to see
// exactly what a Free user sees.
export async function resolvePlan(userId: string): Promise<PlanId> {
  const [grants, subscriptions] = await Promise.all([
    db
      .select({ planId: planGrants.planId })
      .from(planGrants)
      .where(
        and(
          eq(planGrants.userId, userId),
          or(
            isNull(planGrants.expiresAt),
            gt(planGrants.expiresAt, sql`now()`),
          ),
        ),
      ),
    paidSubscriptionsOf(userId),
  ])

  return mostGenerous([
    ...grants.map((grant) => grant.planId),
    // A Plan we no longer recognise confers nothing rather than Free, which
    // would be the same thing said less honestly.
    ...subscriptions.flatMap((row) => planIdFrom(row.plan) ?? []),
  ])
}

// Whether Stripe is still retrying a declined renewal. Reported alongside the
// Plan rather than derived from it: a Grant can be carrying the Plan while the
// card is the one thing the user can still put right.
export async function isRenewalFailing(userId: string): Promise<boolean> {
  const retrying = await db
    .select({ plan: subscription.plan })
    .from(subscription)
    .where(
      and(
        eq(subscription.referenceId, userId),
        eq(subscription.status, RETRYING),
      ),
    )
  // A Subscription to a Plan we no longer recognise confers nothing, so its card
  // is not something the user needs to put right.
  return retrying.some((row) => planIdFrom(row.plan) !== undefined)
}

// Stripe records a pending cancellation either as a flag against the period end
// or, on newer API versions, as a date of its own.
export async function currentSubscription(
  userId: string,
): Promise<CurrentSubscription | null> {
  for (const row of await paidSubscriptionsOf(userId)) {
    const plan = planIdFrom(row.plan)
    if (plan === undefined) continue
    const endsAt = row.cancelAt ?? (row.cancelAtPeriodEnd ? row.periodEnd : null)
    return { plan, endsAt: endsAt ?? null }
  }
  return null
}

// Refuses the next addition once the Plan's limit is met. Never applied to what
// a user already owns: their existing Brews reference that equipment.
export async function assertRoomForAnother(
  plan: PlanId,
  resource: GearResource,
  userId: string,
): Promise<void> {
  const limit = planLimits[plan][resource]
  if (limit === null) return

  const table = gearTable[resource]
  const [{ owned }] = await db
    .select({ owned: count() })
    .from(table)
    .where(eq(table.userId, userId))
  if (owned < limit) return

  throw new TRPCError({
    code: 'FORBIDDEN',
    message: gearLimitSentence(plan, resource) ?? 'Plan limit reached.',
  })
}
