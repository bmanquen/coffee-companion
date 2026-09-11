import { and, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import z from 'zod'
import { db } from '../db'
import { planIdEnum, planInterests } from '../db/schema'
import { sendInterestConfirmation } from '../lib/email'
import { log, requestField } from '../lib/log'
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
    .mutation(async ({ ctx, input, path }) => {
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
          // Swallowed rather than reported, so this line is the only record.
          log('warn', 'interest confirmation not sent', {
            path,
            userId,
            ...requestField(ctx.headers),
            error: error instanceof Error ? error.message : String(error),
          })
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
