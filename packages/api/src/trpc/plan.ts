import { planLimits } from '../lib/plan'
import { planPrices } from '../lib/billing'
import {
  currentGrant,
  currentSubscription,
  endedGrant,
  isRenewalFailing,
} from '../lib/allowance'
import { authedProcedure, createTRPCRouter, publicProcedure } from './init'

export const planRouter = createTRPCRouter({
  // Lets the app warn about a limit before the user reaches it. The server
  // still refuses on create: a client can always be working from a stale Plan.
  current: authedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const [renewalFailing, subscription, grant, ended] = await Promise.all([
      isRenewalFailing(userId),
      currentSubscription(userId),
      currentGrant(userId),
      endedGrant(userId),
    ])
    return {
      plan: ctx.plan,
      limits: planLimits[ctx.plan],
      renewalFailing,
      subscription,
      grant,
      endedGrant: grant ? null : ended,
    }
  }),

  // Public: the pricing page advertises these before anyone signs in.
  prices: publicProcedure.query(() => planPrices()),
})
