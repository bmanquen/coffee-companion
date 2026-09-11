import { TRPCError, initTRPC } from '@trpc/server'
import superjson from 'superjson'
import { auth } from '../lib/auth'
import { e2eBypassSession } from '../lib/e2e-auth'
import { resolvePlan } from '../lib/allowance'
import { shelfLoader } from '../lib/shelf'
import type { Shelf } from '../lib/shelf'
import type { PlanId } from '../lib/plan'

export interface TRPCContext {
  headers: Headers
  // Written by authedProcedure, not passed through `next`: onError only ever
  // sees what createContext returned. Keyed by procedure because one context
  // serves a whole batch, and a public procedure in that batch belongs to
  // nobody however the rest of it authed. See ADR-0012.
  callers?: Map<string, Caller>
}

export interface Caller {
  id: string
  plan?: PlanId
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
})

export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const publicProcedure = t.procedure

// What a user's Plan allows them to read: the Plan itself, and the Shelf whose
// size it sets.
interface Allowance {
  plan: PlanId
  shelf: () => Promise<Shelf>
}

// Resolved once per request rather than once per procedure: tRPC batches a
// dashboard's feeds into a single HTTP request, and the adapter builds one
// context object for it. Keyed on that object, so it is discarded with the
// request. Resolving the Plan and the Shelf together also stops them
// disagreeing — the Shelf's size comes from the Plan.
const allowances = new WeakMap<TRPCContext, Promise<Allowance>>()

function allowanceFor(ctx: TRPCContext, userId: string): Promise<Allowance> {
  const cached = allowances.get(ctx)
  if (cached) return cached

  // Stored before the first await, so procedures sharing a request share this
  // promise rather than racing to resolve one each.
  const pending = resolvePlan(userId).then((plan) => ({
    plan,
    shelf: shelfLoader(userId, plan),
  }))
  allowances.set(ctx, pending)
  return pending
}

export const authedProcedure = t.procedure.use(async ({ ctx, next, path }) => {
  // e2e bypass (test builds only) takes precedence; otherwise resolve the real
  // session from better-auth.
  const session =
    e2eBypassSession(ctx.headers) ??
    (await auth.api.getSession({ headers: ctx.headers }))

  if (!session) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }

  // Before the allowance: a failure resolving it is exactly the error worth
  // naming a caller on.
  const caller: Caller = { id: session.user.id }
  ctx.callers = (ctx.callers ?? new Map()).set(path, caller)

  const { plan, shelf } = await allowanceFor(ctx, session.user.id)
  caller.plan = plan

  return next({ ctx: { ...ctx, session, plan, shelf } })
})
