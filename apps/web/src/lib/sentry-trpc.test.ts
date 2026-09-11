import { describe, expect, it, vi } from 'vitest'
import { reportTrpcError, sentryAreaForProcedure } from './sentry-trpc'
import type { Caller } from '@coffee-companion/api/trpc/init'

const callers = (byPath: Record<string, Caller>) =>
  new Map(Object.entries(byPath))

describe('sentryAreaForProcedure', () => {
  it('names billing, Plan, and Sealing paths so they can be filtered', () => {
    expect(sentryAreaForProcedure('plan.prices')).toBe('billing')
    expect(sentryAreaForProcedure('plan.current')).toBe('plan')
    expect(sentryAreaForProcedure('planInterest.create')).toBe('plan')
    expect(sentryAreaForProcedure('espressoShot.create')).toBe('sealing')
    expect(sentryAreaForProcedure('coffee.delete')).toBe('sealing')
    expect(sentryAreaForProcedure('pouroverBrew.getAll')).toBe('sealing')
  })

  it('leaves everything else as tRPC', () => {
    expect(sentryAreaForProcedure(undefined)).toBe('trpc')
    expect(sentryAreaForProcedure('grinder.getAll')).toBe('trpc')
  })
})

describe('reportTrpcError', () => {
  it('ignores expected refusals', () => {
    const capture = vi.fn()

    for (const code of [
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'BAD_REQUEST',
      'CONFLICT',
    ]) {
      reportTrpcError(
        { code },
        'plan.current',
        {
          callers: callers({ 'plan.current': { id: 'user_123', plan: 'pro' } }),
        },
        capture,
      )
    }

    expect(capture).not.toHaveBeenCalled()
  })

  it('reports an internal error with procedure, area, Plan, and caller', () => {
    const capture = vi.fn()
    const cause = new Error('relation "espresso_shots" does not exist')

    reportTrpcError(
      { code: 'INTERNAL_SERVER_ERROR', cause },
      'espressoShot.create',
      {
        callers: callers({
          'espressoShot.create': { id: 'user_123', plan: 'free' },
        }),
      },
      capture,
    )

    expect(capture).toHaveBeenCalledWith(cause, {
      tags: {
        area: 'sealing',
        procedure: 'espressoShot.create',
        plan: 'free',
      },
      user: { id: 'user_123' },
    })
  })

  it('names nobody, and invents no Plan tag, for a public procedure', () => {
    const capture = vi.fn()

    reportTrpcError(
      { code: 'INTERNAL_SERVER_ERROR' },
      'plan.prices',
      {},
      capture,
    )

    expect(capture).toHaveBeenCalledWith(
      { code: 'INTERNAL_SERVER_ERROR' },
      { tags: { area: 'billing', procedure: 'plan.prices' } },
    )
  })

  it('names nobody for a public procedure batched with an authed one', () => {
    const capture = vi.fn()

    reportTrpcError(
      { code: 'INTERNAL_SERVER_ERROR' },
      'plan.prices',
      { callers: callers({ 'plan.current': { id: 'user_123', plan: 'pro' } }) },
      capture,
    )

    expect(capture).toHaveBeenCalledWith(
      { code: 'INTERNAL_SERVER_ERROR' },
      { tags: { area: 'billing', procedure: 'plan.prices' } },
    )
  })

  it('names nobody when the request never built a context', () => {
    const capture = vi.fn()

    reportTrpcError(
      { code: 'INTERNAL_SERVER_ERROR' },
      'plan.prices',
      undefined,
      capture,
    )

    expect(capture).toHaveBeenCalledWith(
      { code: 'INTERNAL_SERVER_ERROR' },
      { tags: { area: 'billing', procedure: 'plan.prices' } },
    )
  })
})
