import { and, count, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { db } from '../db'
import { brewingDevices, grinders, planGrants } from '../db/schema'

export type PlanId = 'free' | 'pro' | 'proPlus'

const rank: Array<PlanId> = ['free', 'pro', 'proPlus']

const planName: Record<PlanId, string> = {
  free: 'Free',
  pro: 'Pro',
  proPlus: 'Pro+',
}

export type GearResource = 'grinders' | 'brewingDevices'

// null is unlimited.
export const planLimits: Record<PlanId, Record<GearResource, number | null>> = {
  free: { grinders: 1, brewingDevices: 3 },
  pro: { grinders: null, brewingDevices: null },
  proPlus: { grinders: null, brewingDevices: null },
}

const gear = {
  grinders: { table: grinders, one: 'Grinder', many: 'Grinders' },
  brewingDevices: {
    table: brewingDevices,
    one: 'Brewing Device',
    many: 'Brewing Devices',
  },
} as const

function mostGenerous(plans: Array<PlanId>): PlanId {
  return plans.reduce<PlanId>(
    (best, plan) => (rank.indexOf(plan) > rank.indexOf(best) ? plan : best),
    'free',
  )
}

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

  const { table, one, many } = gear[resource]
  const [{ owned }] = await db
    .select({ owned: count() })
    .from(table)
    .where(eq(table.userId, userId))
  if (owned < limit) return

  throw new TRPCError({
    code: 'FORBIDDEN',
    message: `${planName[plan]} holds ${limit} ${limit === 1 ? one : many}.${
      plan === 'free' ? ' Subscribe to add more.' : ''
    }`,
  })
}
