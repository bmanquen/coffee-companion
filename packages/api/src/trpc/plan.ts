import { planLimits } from '../lib/plan'
import { planPrices } from '../lib/billing'
import { isRenewalFailing } from '../lib/allowance'
import { authedProcedure, createTRPCRouter, publicProcedure } from './init'

export const planRouter = createTRPCRouter({
  // Lets the app warn about a limit before the user reaches it. The server
  // still refuses on create: a client can always be working from a stale Plan.
  current: authedProcedure.query(async ({ ctx }) => ({
    plan: ctx.plan,
    limits: planLimits[ctx.plan],
    renewalFailing: await isRenewalFailing(ctx.session.user.id),
  })),

  // Public: the pricing page advertises these before anyone signs in.
  prices: publicProcedure.query(() => planPrices()),
})
