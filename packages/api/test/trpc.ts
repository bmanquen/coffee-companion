import { afterAll, beforeAll } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../src/db'
import {
  brewingDeviceTypes,
  planGrants,
  subscription,
  user,
} from '../src/db/schema'
import { createCallerFactory } from '../src/trpc/init'
import { trpcRouter } from '../src/trpc/router'
import type { PlanId } from '../src/lib/plan'

// Shared setup for the per-router integration tests. Each router has its own
// `<router>.integration.test.ts` file; they all authenticate through the e2e
// cookie bypass instead of mocking better-auth. Enabling it here (imported by
// every integration file) keeps those files free of auth boilerplate.
//
// See src/lib/e2e-auth.ts for the bypass: with E2E_BYPASS_AUTH set, an
// `e2e_auth=<userId>` cookie authenticates the request as that user.
process.env.E2E_BYPASS_AUTH = 'true'

export const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000'

const cookieFor = (userId: string) =>
  new Headers({ cookie: `e2e_auth=${userId}` })

// A caller authenticated as the given user id (must exist in the `user` table).
// Builds a context per call, so each procedure is its own request — matching an
// app that fires one query at a time, and keeping per-request state (the Plan
// and the Shelf) from going stale across a test file.
export const callerFor = (userId: string) =>
  createCallerFactory(trpcRouter)(() => ({ headers: cookieFor(userId) }))

// A caller whose procedures all share one context, the way tRPC's HTTP batching
// puts a dashboard's feeds in a single request. Use it to assert what a request
// resolves once; prefer callerFor everywhere else.
export const batchedCallerFor = (userId: string) => {
  const ctx = { headers: cookieFor(userId) }
  return createCallerFactory(trpcRouter)(ctx)
}

// A caller with no bypass cookie → treated as unauthenticated.
export const anonCaller = createCallerFactory(trpcRouter)({
  headers: new Headers(),
})

// Puts a user on a paid Plan without any payment, the way a comp or a
// developer's own account does. Call it before any fixture that exercises a
// paid Plan's allowances.
export const grantPlan = async (
  userId: string,
  planId: PlanId,
  { reason = 'integration test', expiresAt = null }: GrantOptions = {},
) => {
  await db.insert(planGrants).values({ userId, planId, reason, expiresAt })
}

type GrantOptions = { reason?: string; expiresAt?: Date | null }

// The row the Stripe plugin writes when a purchase completes, without going
// near Stripe. The plan name is stored lowercased because that is what the
// plugin persists; status defaults to a Subscription that is being paid for.
export const subscribePlan = async (
  userId: string,
  planId: PlanId,
  { status = 'active' }: { status?: string } = {},
) => {
  await db.insert(subscription).values({
    id: crypto.randomUUID(),
    plan: planId.toLowerCase(),
    referenceId: userId,
    status,
  })
}

// A Subscription to a Plan the app no longer recognises — a price retired while
// someone was still on it. It confers nothing, so nothing about it is the user's
// to put right.
export const subscribeRetiredPlan = async (userId: string, status: string) => {
  await db.insert(subscription).values({
    id: crypto.randomUUID(),
    plan: 'legacy-gold',
    referenceId: userId,
    status,
  })
}

// Moves a Subscription to the status Stripe would next put it in. Every way a
// paid Plan ends reaches the app as this column changing, so driving it is
// driving the event that wrote it.
export const setSubscriptionStatus = async (userId: string, status: string) => {
  await db
    .update(subscription)
    .set({ status })
    .where(eq(subscription.referenceId, userId))
}

// A cancellation Stripe has accepted but not yet acted on: the Subscription is
// still paid up, and stays that way until the period runs out.
export const scheduleCancellation = async (userId: string) => {
  await db
    .update(subscription)
    .set({ cancelAtPeriodEnd: true })
    .where(eq(subscription.referenceId, userId))
}

// Backdates every Grant a user holds, which is how a Plan lapses: no event
// arrives, the Grant simply stops applying on the next request.
export const expireGrants = async (userId: string) => {
  await db
    .update(planGrants)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(eq(planGrants.userId, userId))
}

// Brewing device types are global rather than per-user, so they neither cascade
// with a test user nor belong to one file. Take whatever is already there, and
// hand back a `cleanup` that removes only the rows this file had to create.
export const deviceTypes = () => {
  const created: Array<string> = []
  return {
    findOrCreate: async (name: string) => {
      const [existing] = await db
        .select()
        .from(brewingDeviceTypes)
        .where(eq(brewingDeviceTypes.name, name))
      if (existing) return existing.id
      const [row] = await db
        .insert(brewingDeviceTypes)
        .values({ name })
        .returning()
      created.push(row.id)
      return row.id
    },
    cleanup: async () => {
      if (created.length) {
        await db
          .delete(brewingDeviceTypes)
          .where(inArray(brewingDeviceTypes.id, created))
      }
    },
  }
}

// Unique names sidestep cross-run collisions on globally-unique lookup columns;
// scope rows to a per-file test user so they cascade-delete with that user.
export const uniqFor = (userId: string) => (label: string) =>
  `${label} ${userId} ${Math.random()}`

// Registers beforeAll/afterAll to seed the given test users and tear them down.
// Deleting the users cascades all their scoped rows, so most files need no other
// cleanup; pass `onCleanup` for global rows (e.g. device types) that don't
// cascade. The DB client is closed last. Call this before registering any
// fixture beforeAll so the users exist by the time those fixtures run.
export function seedUsers(
  ids: Array<string>,
  onCleanup?: () => Promise<void> | void,
) {
  beforeAll(async () => {
    await db.delete(user).where(inArray(user.id, ids))
    await db
      .insert(user)
      .values(ids.map((id) => ({ id, name: id, email: `${id}@example.com` })))
  })
  afterAll(async () => {
    await db.delete(user).where(inArray(user.id, ids))
    await onCleanup?.()
    await db.$client.end()
  })
}
