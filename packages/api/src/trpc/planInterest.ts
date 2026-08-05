import { and, eq } from 'drizzle-orm'
import z from 'zod'
import { db } from '../db'
import { planIdEnum, planInterests } from '../db/schema'
import { authedProcedure, createTRPCRouter } from './init'

export const planInterestRouter = createTRPCRouter({
  register: authedProcedure
    .input(z.object({ planId: z.enum(planIdEnum.enumValues) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      // Not an upsert: rewriting the row would restamp it, and a second press
      // is not a second answer.
      const recorded = await db
        .insert(planInterests)
        .values({ userId, planId: input.planId })
        .onConflictDoNothing()
        .returning()
      if (recorded.length > 0) return recorded[0]

      const [existing] = await db
        .select()
        .from(planInterests)
        .where(
          and(
            eq(planInterests.userId, userId),
            eq(planInterests.planId, input.planId),
          ),
        )
      return existing
    }),
})
