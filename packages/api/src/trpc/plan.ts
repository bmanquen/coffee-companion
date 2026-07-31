import { planLimits } from '../lib/plan'
import { authedProcedure, createTRPCRouter } from './init'

export const planRouter = createTRPCRouter({
  // Lets the app warn about a limit before the user reaches it. The server
  // still refuses on create: a client can always be working from a stale Plan.
  current: authedProcedure.query(({ ctx }) => ({
    plan: ctx.plan,
    limits: planLimits[ctx.plan],
  })),
})
