// Test-only authentication bypass for end-to-end tests.
//
// When E2E_BYPASS_AUTH=true AND the request carries an `e2e_auth=<userId>`
// cookie or `x-e2e-auth` header, the request is treated as authenticated as
// that user. This lets the authenticated-page e2e tests run without exercising
// the real Google OAuth / session machinery (which is better-auth's concern,
// not ours to test).
//
// Two independent guards keep this safe:
//   - the env var is never set in production, and
//   - the cookie/header scopes the bypass to the test client only (so, e.g.,
//     the public-landing test still sees the unauthenticated site).
//
// The value is the user id, so different test contexts can act as different
// users (e.g. one with seeded data, one empty). Native E2E also sends
// `x-e2e-auth` because React Native fetch treats Cookie as forbidden and the
// Expo client sets credentials: omit, so a SecureStore cookie map never
// arrives as a Cookie header the way a browser document cookie does.
export const E2E_AUTH_COOKIE_NAME = 'e2e_auth'
export const E2E_AUTH_HEADER = 'x-e2e-auth'
export const E2E_USER_WITH_DATA = 'e2e-user-with-data'
export const E2E_USER_EMPTY = 'e2e-user-empty'
// Holds the same library as E2E_USER_WITH_DATA but no Grant, so the two of them
// read the same rows on different Plans.
export const E2E_USER_FREE = 'e2e-user-free'
export const E2E_USER_DELETE = 'e2e-user-delete'

function makeSession(userId: string) {
  return {
    user: {
      id: userId,
      name: 'E2E Tester',
      email: `${userId}@example.com`,
      emailVerified: true,
      image: null as string | null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      deletedAt: null as Date | null,
    },
    session: {
      id: `e2e-session-${userId}`,
      token: `e2e-token-${userId}`,
      userId,
      expiresAt: new Date(8640000000000000),
      createdAt: new Date(0),
      updatedAt: new Date(0),
      ipAddress: null as string | null,
      userAgent: null as string | null,
    },
  }
}

export type E2ESession = ReturnType<typeof makeSession>

function e2eAuthUserId(headers: Headers): string | null {
  const cookie = headers.get('cookie') ?? ''
  const match = cookie.match(
    new RegExp(`(?:^|;\\s*)${E2E_AUTH_COOKIE_NAME}=([^;]+)`),
  )
  const fromCookie = match ? decodeURIComponent(match[1].trim()) : ''
  if (fromCookie) return fromCookie
  const fromHeader = headers.get(E2E_AUTH_HEADER)?.trim()
  return fromHeader ? decodeURIComponent(fromHeader) : null
}

export function e2eBypassSession(headers: Headers): E2ESession | null {
  if (process.env.E2E_BYPASS_AUTH !== 'true') return null
  const userId = e2eAuthUserId(headers)
  return userId ? makeSession(userId) : null
}
