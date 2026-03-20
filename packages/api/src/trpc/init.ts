import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { auth } from '../lib/auth'

export interface TRPCContext {
  headers: Headers
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
})

export const createTRPCRouter = t.router
export const publicProcedure = t.procedure

export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const session = await auth.api.getSession({
    headers: ctx.headers,
  })

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
