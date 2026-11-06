import {
  E2E_AUTH_COOKIE_NAME as API_E2E_AUTH_COOKIE_NAME,
  E2E_AUTH_HEADER as API_E2E_AUTH_HEADER,
  E2E_USER_DELETE as API_E2E_USER_DELETE,
  E2E_USER_EMPTY as API_E2E_USER_EMPTY,
  E2E_USER_FREE as API_E2E_USER_FREE,
  E2E_USER_WITH_DATA as API_E2E_USER_WITH_DATA,
  e2eBypassSession,
} from '../../../../packages/api/src/lib/e2e-auth'
import {
  E2E_AUTH_COOKIE_NAME,
  E2E_AUTH_HEADER,
  E2E_USER_DELETE,
  E2E_USER_EMPTY,
  E2E_USER_ENV,
  E2E_USER_FREE,
  E2E_USER_WITH_DATA,
  authResponseSessionSummary,
  e2eSignInUser,
  hasE2EAuthHeader,
  headerNames,
  withE2EAuthHeader,
} from './e2e'

describe('e2eSignInUser', () => {
  const original = process.env[E2E_USER_ENV]

  afterEach(() => {
    if (original === undefined) delete process.env[E2E_USER_ENV]
    else process.env[E2E_USER_ENV] = original
  })

  it('returns null when the env is unset', () => {
    delete process.env[E2E_USER_ENV]
    expect(e2eSignInUser()).toBeNull()
  })

  it('returns the persona in a development build', () => {
    expect(e2eSignInUser(E2E_USER_WITH_DATA, true)).toBe(E2E_USER_WITH_DATA)
  })

  it('is unreachable in a production build even when the env is set', () => {
    expect(e2eSignInUser(E2E_USER_WITH_DATA, false)).toBeNull()
  })
})

describe('withE2EAuthHeader', () => {
  it('sets x-e2e-auth on a Headers object so RN fetch cannot drop it as Cookie', () => {
    const next = withE2EAuthHeader(
      { headers: { cookie: `e2e_auth=${E2E_USER_WITH_DATA}` } },
      E2E_USER_WITH_DATA,
      true,
    )
    const headers = new Headers(next.headers)
    expect(headers.get(E2E_AUTH_HEADER)).toBe(E2E_USER_WITH_DATA)
    expect(hasE2EAuthHeader(next.headers)).toBe(true)
    expect(headerNames(next.headers)).toEqual(['cookie', 'x-e2e-auth'])
  })

  it('does not set x-e2e-auth in a production build', () => {
    const next = withE2EAuthHeader(
      { headers: { cookie: `e2e_auth=${E2E_USER_WITH_DATA}` } },
      E2E_USER_WITH_DATA,
      false,
    )
    expect(hasE2EAuthHeader(next.headers)).toBe(false)
  })
})

describe('authResponseSessionSummary', () => {
  it('summarizes a session body as the user id or null', () => {
    expect(authResponseSessionSummary(null)).toBe('null')
    expect(authResponseSessionSummary({ user: null })).toBe('user=null')
    expect(
      authResponseSessionSummary({ user: { id: E2E_USER_WITH_DATA } }),
    ).toBe(`user=${E2E_USER_WITH_DATA}`)
    expect(authResponseSessionSummary({ user: { id: 'user-xyz' } })).toBe(
      'user=present',
    )
  })

  it('names a non-object body and a user without a usable id', () => {
    expect(authResponseSessionSummary('nope')).toBe('non-object')
    expect(authResponseSessionSummary({ user: { name: 'x' } })).toBe(
      'user=missing-id',
    )
    expect(authResponseSessionSummary({ user: { id: '' } })).toBe(
      'user=missing-id',
    )
  })
})

describe('mobile E2E contract', () => {
  const originalBypass = process.env.E2E_BYPASS_AUTH

  afterEach(() => {
    if (originalBypass === undefined) delete process.env.E2E_BYPASS_AUTH
    else process.env.E2E_BYPASS_AUTH = originalBypass
  })

  it('matches the API header, cookie, and personas so Expo-inlined values authenticate', () => {
    expect(E2E_USER_ENV).toBe('EXPO_PUBLIC_E2E_USER')
    expect(E2E_AUTH_COOKIE_NAME).toBe(API_E2E_AUTH_COOKIE_NAME)
    expect(E2E_AUTH_HEADER).toBe(API_E2E_AUTH_HEADER)
    expect(E2E_USER_WITH_DATA).toBe(API_E2E_USER_WITH_DATA)
    expect(E2E_USER_EMPTY).toBe(API_E2E_USER_EMPTY)
    expect(E2E_USER_FREE).toBe(API_E2E_USER_FREE)
    expect(E2E_USER_DELETE).toBe(API_E2E_USER_DELETE)

    process.env.E2E_BYPASS_AUTH = 'true'
    const session = e2eBypassSession(
      new Headers({ [E2E_AUTH_HEADER]: E2E_USER_WITH_DATA }),
    )
    expect(session?.user.id).toBe(E2E_USER_WITH_DATA)
  })
})
