import { describe, expect, it, vi } from 'vitest'
import { reportTrpcError, sentryAreaForProcedure } from './sentry-trpc'

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
      reportTrpcError({ code }, 'plan.current', { plan: 'pro' }, capture)
    }

    expect(capture).not.toHaveBeenCalled()
  })

  it('reports an internal error with procedure, area, and Plan', () => {
    const capture = vi.fn()
    const cause = new Error('relation "espresso_shots" does not exist')

    reportTrpcError(
      { code: 'INTERNAL_SERVER_ERROR', cause },
      'espressoShot.create',
      { plan: 'free' },
      capture,
    )

    expect(capture).toHaveBeenCalledWith(cause, {
      tags: {
        area: 'sealing',
        procedure: 'espressoShot.create',
        plan: 'free',
      },
    })
  })

  it('does not invent a Plan tag from a public procedure', () => {
    const capture = vi.fn()

    reportTrpcError(
      { code: 'INTERNAL_SERVER_ERROR' },
      'plan.prices',
      { headers: new Headers() },
      capture,
    )

    expect(capture).toHaveBeenCalledWith(
      { code: 'INTERNAL_SERVER_ERROR' },
      { tags: { area: 'billing', procedure: 'plan.prices' } },
    )
  })
})
