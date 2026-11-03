import { E2E_USER_ENV, E2E_USER_WITH_DATA, e2eSignInUser } from './e2e'

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
