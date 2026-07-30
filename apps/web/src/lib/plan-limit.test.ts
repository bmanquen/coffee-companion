import { describe, expect, it } from 'vitest'
import { planLimitMessage } from './plan-limit'

const trpcError = (code: string, message: string) =>
  Object.assign(new Error(message), { data: { code } })

describe('planLimitMessage', () => {
  it('returns the server’s message when a Plan limit refused the request', () => {
    expect(
      planLimitMessage(
        trpcError('FORBIDDEN', 'Free holds 1 grinder. Subscribe to add more.'),
      ),
    ).toBe('Free holds 1 grinder. Subscribe to add more.')
  })

  it('ignores a validation failure', () => {
    expect(planLimitMessage(trpcError('BAD_REQUEST', 'Name is required'))).toBe(
      null,
    )
  })

  it('ignores a server failure', () => {
    expect(
      planLimitMessage(trpcError('INTERNAL_SERVER_ERROR', 'Boom')),
    ).toBe(null)
  })

  it('ignores no error at all', () => {
    expect(planLimitMessage(null)).toBe(null)
    expect(planLimitMessage(undefined)).toBe(null)
  })

  it('ignores an error with no tRPC shape', () => {
    expect(planLimitMessage(new Error('offline'))).toBe(null)
  })
})
