import { afterEach, describe, expect, it } from 'vitest'
import { allowE2EAuthUsers } from '../../test/e2e-auth'
import {
  E2E_AUTH_ALLOWED_NODE_ENVS,
  E2E_AUTH_HEADER,
  E2E_USER_EMPTY,
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
    process.env.NODE_ENV = 'test'
    expect(
      e2eBypassSession(
        new Headers({ cookie: `e2e_auth=${E2E_USER_WITH_DATA}` }),
      ),
    ).toBeNull()
    expect(
      e2eBypassSession(new Headers({ [E2E_AUTH_HEADER]: E2E_USER_WITH_DATA })),
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
      new Headers({ cookie: `e2e_auth=${E2E_USER_WITH_DATA}` }),
    )
    expect(session).not.toBeNull()
    expect(session?.user.id).toBe(E2E_USER_WITH_DATA)
    expect(session?.session.userId).toBe(E2E_USER_WITH_DATA)
  })

  it('returns a session for the user id in x-e2e-auth when Cookie is absent', () => {
    process.env.E2E_BYPASS_AUTH = 'true'
    const session = e2eBypassSession(
      new Headers({ [E2E_AUTH_HEADER]: E2E_USER_WITH_DATA }),
    )
    expect(session).not.toBeNull()
    expect(session?.user.id).toBe(E2E_USER_WITH_DATA)
  })

  it('uses a valid x-e2e-auth header when the cookie id is not allow-listed', () => {
    process.env.E2E_BYPASS_AUTH = 'true'
    const session = e2eBypassSession(
      new Headers({
        cookie: 'e2e_auth=user-xyz',
        [E2E_AUTH_HEADER]: E2E_USER_WITH_DATA,
      }),
    )
    expect(session?.user.id).toBe(E2E_USER_WITH_DATA)
  })

  it('prefers an allow-listed cookie over the header', () => {
    process.env.E2E_BYPASS_AUTH = 'true'
    const session = e2eBypassSession(
      new Headers({
        cookie: `e2e_auth=${E2E_USER_WITH_DATA}`,
        [E2E_AUTH_HEADER]: E2E_USER_EMPTY,
      }),
    )
    expect(session?.user.id).toBe(E2E_USER_WITH_DATA)
  })

  it('returns null for an unknown user id even when the bypass flag is set', () => {
    process.env.E2E_BYPASS_AUTH = 'true'
    expect(
      e2eBypassSession(new Headers({ cookie: 'e2e_auth=user-xyz' })),
    ).toBeNull()
    expect(
      e2eBypassSession(new Headers({ [E2E_AUTH_HEADER]: 'someone' })),
    ).toBeNull()
  })

  it('returns a session for a fixture id after it is allow-listed', () => {
    process.env.E2E_BYPASS_AUTH = 'true'
    expect(
      e2eBypassSession(new Headers({ cookie: 'e2e_auth=fixture-user' })),
    ).toBeNull()
    allowE2EAuthUsers(['fixture-user'])
    expect(
      e2eBypassSession(new Headers({ cookie: 'e2e_auth=fixture-user' }))?.user
        .id,
    ).toBe('fixture-user')
  })

  it('returns null when NODE_ENV is unset, production, or staging even with the bypass flag', () => {
    process.env.E2E_BYPASS_AUTH = 'true'
    const headers = new Headers({
      cookie: `e2e_auth=${E2E_USER_WITH_DATA}`,
      [E2E_AUTH_HEADER]: E2E_USER_WITH_DATA,
    })
    for (const nodeEnv of [undefined, 'production', 'staging'] as const) {
      if (nodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = nodeEnv
      expect(e2eBypassSession(headers), `NODE_ENV=${String(nodeEnv)}`).toBeNull()
    }
  })

  it('bypasses when NODE_ENV is test or development', () => {
    process.env.E2E_BYPASS_AUTH = 'true'
    for (const nodeEnv of E2E_AUTH_ALLOWED_NODE_ENVS) {
      process.env.NODE_ENV = nodeEnv
      expect(
        e2eBypassSession(
          new Headers({ cookie: `e2e_auth=${E2E_USER_WITH_DATA}` }),
        )?.user.id,
      ).toBe(E2E_USER_WITH_DATA)
    }
  })

  it('does not export the allow-list mutator from the runtime module', async () => {
    const runtime = await import('./e2e-auth')
    expect('allowE2EAuthUsers' in runtime).toBe(false)
    expect('e2eAuthAllowList' in runtime).toBe(false)
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
