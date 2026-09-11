import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authedProcedure, createTRPCRouter, publicProcedure } from './init'
import type { TRPCContext } from './init'

const getSession = vi.hoisted(() => vi.fn())
vi.mock('../lib/auth', () => ({ auth: { api: { getSession } } }))
const resolvePlan = vi.hoisted(() => vi.fn(async () => 'pro'))
vi.mock('../lib/allowance', () => ({ resolvePlan }))
vi.mock('../lib/shelf', () => ({ shelfLoader: () => async () => new Set() }))

const router = createTRPCRouter({
  authedBoom: authedProcedure.query(() => {
    throw new Error('relation "espresso_shots" does not exist')
  }),
  publicBoom: publicProcedure.query(() => {
    throw new Error('stripe is unreachable')
  }),
})

// The context onError is handed, which is what an error report can read.
async function reportedContextFor(path: string) {
  const ctx: TRPCContext = { headers: new Headers() }
  let reported: unknown

  await fetchRequestHandler({
    req: new Request(`http://localhost/api/trpc/${path}`),
    router,
    endpoint: '/api/trpc',
    createContext: () => ctx,
    onError: (options) => {
      reported = options.ctx
    },
  })

  return reported as TRPCContext | undefined
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

    expect(await reportedContextFor('authedBoom')).toMatchObject({
      caller: { id: 'user_123', plan: 'pro' },
    })
  })

  it('names the caller even when resolving their allowance is what failed', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_123' } })
    resolvePlan.mockRejectedValue(new Error('the database is unreachable'))

    expect(await reportedContextFor('authedBoom')).toMatchObject({
      caller: { id: 'user_123' },
    })
  })

  it('names nobody when the procedure is public', async () => {
    getSession.mockResolvedValue(null)

    expect((await reportedContextFor('publicBoom'))?.caller).toBeUndefined()
  })
})
