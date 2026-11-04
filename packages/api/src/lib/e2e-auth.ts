// Test-only authentication bypass for end-to-end tests.
//
// When E2E_BYPASS_AUTH=true AND the request carries an `e2e_auth=<userId>`
// cookie or `x-e2e-auth` header, the request is treated as authenticated as
// that user. This lets the authenticated-page e2e tests run without exercising
// the real Google OAuth / session machinery (which is better-auth's concern,
// not ours to test).
//
// Independent guards keep this safe:
//   - a production *runtime* never bypasses, even if the flag is set,
//   - the env var is never set in production, and
//   - the cookie/header scopes the bypass to the test client only (so, e.g.,
//     the public-landing test still sees the unauthenticated site).
//
// Playwright and verify-* boot the production *build* with NODE_ENV=test.
// The guard keys off runtime NODE_ENV so that local/CI e2e can still
// authenticate, while a real deploy (NODE_ENV=production) cannot.
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

function isProductionRuntime(env: { NODE_ENV?: string } = process.env) {
  // Property access on the env object so a production *build* still honors
  // the process NODE_ENV at runtime (bundlers inline `process.env.NODE_ENV`).
  return env.NODE_ENV === 'production'
}

function decodeE2EAuthValue(value: string | undefined): string | null {
  if (!value) return null
  try {
    const decoded = decodeURIComponent(value.trim()).trim()
    return decoded ? decoded : null
  } catch {
    return null
  }
}

function e2eAuthUserId(headers: Headers): string | null {
  const cookie = headers.get('cookie') ?? ''
  const match = cookie.match(
    new RegExp(`(?:^|;\\s*)${E2E_AUTH_COOKIE_NAME}=([^;]+)`),
  )
  const fromCookie = decodeE2EAuthValue(match?.[1])
  if (fromCookie) return fromCookie
  return decodeE2EAuthValue(headers.get(E2E_AUTH_HEADER)?.trim())
}

// HTTP E2E stays on these personas. Integration fixtures add the ids they seed.
// Unknown ids stay rejected so a leaked bypass cannot impersonate a real user.
const allowedE2EUserIds = new Set([
  E2E_USER_WITH_DATA,
  E2E_USER_EMPTY,
  E2E_USER_FREE,
  E2E_USER_DELETE,
])

export function allowE2EAuthUsers(ids: Iterable<string>) {
  for (const id of ids) {
    const trimmed = id.trim()
    if (trimmed) allowedE2EUserIds.add(trimmed)
  }
}

export function e2eBypassSession(headers: Headers): E2ESession | null {
  if (isProductionRuntime()) return null
  if (process.env.E2E_BYPASS_AUTH !== 'true') return null
  const userId = e2eAuthUserId(headers)
  return userId && allowedE2EUserIds.has(userId) ? makeSession(userId) : null
}
