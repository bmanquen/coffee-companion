import { afterEach, describe, expect, it } from 'vitest'
import {
  E2E_AUTH_HEADER,
  E2E_USER_WITH_DATA,
  e2eBypassSession,
} from './e2e-auth'

describe('e2eBypassSession', () => {
  const originalBypass = process.env.E2E_BYPASS_AUTH
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    if (originalBypass === undefined) delete process.env.E2E_BYPASS_AUTH
    else process.env.E2E_BYPASS_AUTH = originalBypass
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
  })

  it('returns null when the bypass env flag is not set', () => {
    delete process.env.E2E_BYPASS_AUTH
    expect(e2eBypassSession(new Headers({ cookie: 'e2e_auth=someone' }))).toBeNull()
    expect(
      e2eBypassSession(new Headers({ [E2E_AUTH_HEADER]: 'someone' })),
    ).toBeNull()
  })

  it('returns null when the bypass cookie and header are missing', () => {
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

  it('returns a session for the user id in x-e2e-auth when Cookie is absent', () => {
    process.env.E2E_BYPASS_AUTH = 'true'
    const session = e2eBypassSession(
      new Headers({ [E2E_AUTH_HEADER]: 'user-xyz' }),
    )
    expect(session).not.toBeNull()
    expect(session?.user.id).toBe('user-xyz')
  })

  it('ignores x-e2e-auth and the cookie in production even when the bypass flag is set', () => {
    process.env.E2E_BYPASS_AUTH = 'true'
    process.env.NODE_ENV = 'production'
    expect(
      e2eBypassSession(
        new Headers({
          cookie: `e2e_auth=${E2E_USER_WITH_DATA}`,
          [E2E_AUTH_HEADER]: E2E_USER_WITH_DATA,
        }),
      ),
    ).toBeNull()
  })

  it('returns null when the cookie or header value is not decodable', () => {
    process.env.E2E_BYPASS_AUTH = 'true'
    expect(
      e2eBypassSession(new Headers({ cookie: 'e2e_auth=%E0' })),
    ).toBeNull()
    expect(
      e2eBypassSession(new Headers({ [E2E_AUTH_HEADER]: '%E0' })),
    ).toBeNull()
  })
})
