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
  it('is true for an APIError, a user-only body, or a redirect without a session', async () => {
    expect(await socialSignInFailed(undefined)).toBe(true)
    expect(
      await socialSignInFailed(new APIError('UNAUTHORIZED', { message: 'failed' })),
    ).toBe(true)
    expect(await socialSignInFailed(new Response(null, { status: 401 }))).toBe(
      true,
    )
    expect(
      await socialSignInFailed({
        redirect: true,
        url: 'https://accounts.google.com',
      }),
    ).toBe(true)
    expect(await socialSignInFailed({ user: { id: 'u1' } })).toBe(true)
    expect(
      await socialSignInFailed({ session: { user: { id: 'u1' } } }),
    ).toBe(true)
    expect(
      await socialSignInFailed(
        new Response(JSON.stringify({ user: { id: 'u1' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ).toBe(true)
  })

  it('is false when sign-in produced a session token', async () => {
    expect(
      await socialSignInFailed({
        redirect: false,
        token: 'session-token',
        user: { id: 'u1', email: 'ada@example.com' },
      }),
    ).toBe(false)
    expect(
      await socialSignInFailed({ session: { token: 'session-token' } }),
    ).toBe(false)
    expect(
      await socialSignInFailed(
        new Response(null, {
          status: 200,
          headers: {
            'set-cookie': 'better-auth.session_token=session-token; Path=/',
          },
        }),
      ),
    ).toBe(false)
    expect(
      await socialSignInFailed(
        { user: { id: 'u1' } },
        new Headers({
          'set-cookie':
            '__Secure-better-auth.session_token=session-token; Path=/; Secure',
        }),
      ),
    ).toBe(false)
  })
})
