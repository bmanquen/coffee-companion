import { and, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import z from 'zod'
import { db } from '../db'
import { planIdEnum, planInterests } from '../db/schema'
import { sendInterestConfirmation } from '../lib/email'
import { planName, sellable } from '../lib/plan'
import { authedProcedure, createTRPCRouter } from './init'

export const planInterestRouter = createTRPCRouter({
  list: authedProcedure.query(({ ctx }) =>
    db.query.planInterests.findMany({
      where: { userId: ctx.session.user.id },
    }),
  ),

  register: authedProcedure
    .input(z.object({ planId: z.enum(planIdEnum.enumValues) }))
    .mutation(async ({ ctx, input }) => {
      if (sellable[input.planId]) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${planName[input.planId]} is on sale — subscribe to it rather than registering interest.`,
        })
      }

      const userId = ctx.session.user.id

      // Not an upsert: rewriting the row would restamp it, and a second press
      // is not a second answer.
      const recorded = await db
        .insert(planInterests)
        .values({ userId, planId: input.planId })
        .onConflictDoNothing()
        .returning()

      if (recorded.length > 0) {
        // The interest is saved by here; a mail failure must not undo it.
        try {
          await sendInterestConfirmation({
            to: ctx.session.user.email,
            name: ctx.session.user.name,
          })
        } catch (error) {
          console.error('Interest confirmation failed to send:', error)
        }
        return recorded[0]
      }

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
