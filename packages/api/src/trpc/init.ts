import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { auth } from '../lib/auth'
import { e2eBypassSession } from '../lib/e2e-auth'

export interface TRPCContext {
  headers: Headers
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
})

export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const publicProcedure = t.procedure

export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  // e2e bypass (test builds only) takes precedence; otherwise resolve the real
  // session from better-auth.
  const session =
    e2eBypassSession(ctx.headers) ??
    (await auth.api.getSession({ headers: ctx.headers }))

  if (!session) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }

  return next({
    ctx: {
      ...ctx,
      session,
    },
  })
})
