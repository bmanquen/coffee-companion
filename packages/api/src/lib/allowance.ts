import {
  and,
  count,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { db } from '../db'
import {
  brewingDevices,
  grinders,
  planGrants,
  subscription,
} from '../db/schema'
import {
  RETRYING,
  gearLimitSentence,
  mostGenerous,
  paidStatuses,
  planIdFrom,
  planLimits,
} from './plan'
import type {
  CurrentGrant,
  CurrentSubscription,
  EndedGrant,
  GearResource,
  PlanId,
} from './plan'

const gearTable = {
  grinders,
  brewingDevices,
} as const

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

const liveGrantWhere = (userId: string) =>
  and(
    eq(planGrants.userId, userId),
    or(isNull(planGrants.expiresAt), gt(planGrants.expiresAt, sql`now()`)),
  )

const liveGrantsOf = (userId: string) =>
  db
    .select({ planId: planGrants.planId, expiresAt: planGrants.expiresAt })
    .from(planGrants)
    .where(liveGrantWhere(userId))

function paidGrant(
  rows: Array<{ planId: PlanId; expiresAt: Date | null }>,
): CurrentGrant | null {
  const paid = rows.filter((row) => row.planId !== 'free')
  const plan = mostGenerous(paid.map((row) => row.planId))
  if (plan === 'free') return null
  const ofPlan = paid.filter((row) => row.planId === plan)
  if (ofPlan.some((row) => row.expiresAt === null)) {
    return { plan, endsAt: null, afterThat: null }
  }
  const endsAt = ofPlan.reduce<Date | null>((latest, row) => {
    if (!row.expiresAt) return latest
    if (!latest || row.expiresAt > latest) return row.expiresAt
    return latest
  }, null)
  if (!endsAt) return { plan, endsAt: null, afterThat: null }
  const continuing = paid
    .filter((row) => row.expiresAt === null || row.expiresAt > endsAt)
    .map((row) => row.planId)
  const afterThat = mostGenerous(continuing)
  return {
    plan,
    endsAt,
    afterThat: afterThat === 'free' ? null : afterThat,
  }
}

// A Grant and a Subscription are the two sources of a Plan, and the most
// generous of them wins — so a comp is never downgraded by billing state, and
// a paid Subscription is never downgraded by a lesser Grant.
//
// No role ever confers a Plan: a maintainer account has to be able to see
// exactly what a Free user sees.
export async function resolvePlan(userId: string): Promise<PlanId> {
  const [grants, subscriptions] = await Promise.all([
    liveGrantsOf(userId),
    paidSubscriptionsOf(userId),
  ])

  return mostGenerous([
    ...grants.map((grant) => grant.planId),
    // A Plan we no longer recognise confers nothing rather than Free, which
    // would be the same thing said less honestly.
    ...subscriptions.flatMap((row) => planIdFrom(row.plan) ?? []),
  ])
}

export async function currentGrant(
  userId: string,
): Promise<CurrentGrant | null> {
  return paidGrant(await liveGrantsOf(userId))
}

export async function endedGrant(userId: string): Promise<EndedGrant | null> {
  const rows = await db
    .select({ planId: planGrants.planId, expiresAt: planGrants.expiresAt })
    .from(planGrants)
    .where(
      and(
        eq(planGrants.userId, userId),
        isNotNull(planGrants.expiresAt),
        lte(planGrants.expiresAt, sql`now()`),
      ),
    )

  const ended = rows
    .filter((row) => row.planId !== 'free' && row.expiresAt)
    .sort(
      (left, right) =>
        (right.expiresAt?.getTime() ?? 0) - (left.expiresAt?.getTime() ?? 0),
    )
  const latest = ended[0]
  if (!latest?.expiresAt) return null
  return { plan: latest.planId, endedAt: latest.expiresAt }
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
    const endsAt =
      row.cancelAt ?? (row.cancelAtPeriodEnd ? row.periodEnd : null)
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
