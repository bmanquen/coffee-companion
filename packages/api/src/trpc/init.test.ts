import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authedProcedure, createTRPCRouter, publicProcedure } from './init'
import type { Caller, TRPCContext } from './init'

const getSession = vi.hoisted(() => vi.fn())
vi.mock('../lib/auth', () => ({ auth: { api: { getSession } } }))
const resolvePlan = vi.hoisted(() => vi.fn(async () => 'pro'))
vi.mock('../lib/allowance', () => ({ resolvePlan }))
vi.mock('../lib/shelf', () => ({ shelfLoader: () => async () => new Set() }))

const router = createTRPCRouter({
  authedBoom: authedProcedure.query(() => {
    throw new Error('relation "espresso_shots" does not exist')
  }),
  publicBoom: publicProcedure.query(async () => {
    // A timer, so this fails on a later tick than the authed procedure's
    // session and allowance — the order a slow Stripe call really fails in,
    // and the only order in which a shared caller could leak onto it.
    await new Promise((resolve) => setTimeout(resolve, 0))
    throw new Error('stripe is unreachable')
  }),
})

// The caller each failing procedure is reported under — a report reads the
// context onError is handed, keyed by the path that failed.
async function reportedCallers(...paths: Array<string>) {
  const ctx: TRPCContext = { headers: new Headers() }
  const batched = paths.length > 1
  const reported = new Map<string, Caller | undefined>()

  await fetchRequestHandler({
    req: new Request(
      `http://localhost/api/trpc/${paths.join(',')}${batched ? '?batch=1' : ''}`,
    ),
    router,
    endpoint: '/api/trpc',
    createContext: () => ctx,
    onError: ({ path, ctx: reportedCtx }) => {
      reported.set(path ?? '', reportedCtx?.callers?.get(path ?? ''))
    },
  })

  return reported
}

describe('authedProcedure', () => {
  beforeEach(() => {
    resolvePlan.mockResolvedValue('pro')
  })

  it('names the caller on the context an error report is given', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user_123', email: 'ada@example.com', name: 'Ada' },
      session: { token: 'secret' },
    })

    expect((await reportedCallers('authedBoom')).get('authedBoom')).toEqual({
      id: 'user_123',
      plan: 'pro',
    })
  })

  it('names the caller even when resolving their allowance is what failed', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_123' } })
    resolvePlan.mockRejectedValue(new Error('the database is unreachable'))

    expect((await reportedCallers('authedBoom')).get('authedBoom')).toEqual({
      id: 'user_123',
    })
  })

  it('names nobody when the procedure is public', async () => {
    getSession.mockResolvedValue(null)

    expect(
      (await reportedCallers('publicBoom')).get('publicBoom'),
    ).toBeUndefined()
  })

  it('names nobody on the public half of a batch the rest of which authed', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_123' } })

    const reported = await reportedCallers('authedBoom', 'publicBoom')

    // Both halves really failed, so the public one naming nobody is a result
    // and not an error that never happened.
    expect([...reported.keys()].sort()).toEqual(['authedBoom', 'publicBoom'])
    expect(reported.get('authedBoom')).toEqual({ id: 'user_123', plan: 'pro' })
    expect(reported.get('publicBoom')).toBeUndefined()
  })
})
