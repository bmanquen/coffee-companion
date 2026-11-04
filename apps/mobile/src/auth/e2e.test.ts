import {
  E2E_AUTH_HEADER,
  E2E_USER_ENV,
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

  it('summarizes a session body as the user id or null', () => {
    expect(authResponseSessionSummary(null)).toBe('null')
    expect(authResponseSessionSummary({ user: null })).toBe('user=null')
    expect(
      authResponseSessionSummary({ user: { id: E2E_USER_WITH_DATA } }),
    ).toBe(`user=${E2E_USER_WITH_DATA}`)
  })
})
