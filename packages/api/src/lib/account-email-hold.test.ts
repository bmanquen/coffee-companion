import { describe, expect, it } from 'vitest'
import { APIError } from 'better-auth/api'
import {
  releasedEmailHoldOf,
  rememberReleasedEmailHold,
  socialSignInFailed,
} from './account-email-hold'

describe('released email hold context', () => {
  it('stores the hold on the request context and ignores a missing release', () => {
    const context = {}
    rememberReleasedEmailHold(context, null)
    expect(releasedEmailHoldOf(context)).toBeUndefined()
    rememberReleasedEmailHold(context, { email: 'ada@example.com', userId: 'u1' })
    expect(releasedEmailHoldOf(context)).toEqual({
      email: 'ada@example.com',
      userId: 'u1',
    })
  })
})

describe('socialSignInFailed', () => {
  it('is true for an APIError or a body without a session', () => {
    expect(socialSignInFailed(undefined)).toBe(true)
    expect(
      socialSignInFailed(new APIError('UNAUTHORIZED', { message: 'failed' })),
    ).toBe(true)
    expect(socialSignInFailed(new Response(null, { status: 401 }))).toBe(true)
    expect(socialSignInFailed({ redirect: true, url: 'https://accounts.google.com' })).toBe(
      true,
    )
  })

  it('is false when sign-in produced a session or linked user', () => {
    expect(
      socialSignInFailed({
        redirect: false,
        token: 'session-token',
        user: { id: 'u1', email: 'ada@example.com' },
      }),
    ).toBe(false)
  })
})
