import { and, count, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { db } from '../db'
import { brewingDevices, grinders, planGrants } from '../db/schema'
import { gearLimitSentence, mostGenerous, planLimits } from './plan'
import type { GearResource, PlanId } from './plan'

const gearTable = {
  grinders,
  brewingDevices,
} as const

// No role ever confers a Plan: a maintainer account has to be able to see
// exactly what a Free user sees.
export async function resolvePlan(userId: string): Promise<PlanId> {
  const grants = await db
    .select({ planId: planGrants.planId })
    .from(planGrants)
    .where(
      and(
        eq(planGrants.userId, userId),
        or(isNull(planGrants.expiresAt), gt(planGrants.expiresAt, sql`now()`)),
      ),
    )

  return mostGenerous(grants.map((grant) => grant.planId))
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
