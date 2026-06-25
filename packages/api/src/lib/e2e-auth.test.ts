import { afterEach, describe, expect, it } from 'vitest'
import { e2eBypassSession } from './e2e-auth'

describe('e2eBypassSession', () => {
  const original = process.env.E2E_BYPASS_AUTH

  afterEach(() => {
    if (original === undefined) delete process.env.E2E_BYPASS_AUTH
    else process.env.E2E_BYPASS_AUTH = original
  })

  it('returns null when the bypass env flag is not set', () => {
    delete process.env.E2E_BYPASS_AUTH
    expect(e2eBypassSession(new Headers({ cookie: 'e2e_auth=someone' }))).toBeNull()
  })

  it('returns null when the bypass cookie is missing', () => {
    process.env.E2E_BYPASS_AUTH = 'true'
    expect(e2eBypassSession(new Headers())).toBeNull()
    expect(e2eBypassSession(new Headers({ cookie: 'other=1' }))).toBeNull()
  })

  it('returns a session for the user id in the cookie', () => {
    process.env.E2E_BYPASS_AUTH = 'true'
    const session = e2eBypassSession(
      new Headers({ cookie: 'e2e_auth=user-xyz' }),
    )
    expect(session).not.toBeNull()
    expect(session?.user.id).toBe('user-xyz')
    expect(session?.session.userId).toBe('user-xyz')
  })
})
