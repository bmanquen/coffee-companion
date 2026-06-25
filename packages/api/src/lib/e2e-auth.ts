// Test-only authentication bypass for end-to-end tests.
//
// When E2E_BYPASS_AUTH=true AND the request carries an `e2e_auth=<userId>`
// cookie, the request is treated as authenticated as that user. This lets the
// authenticated-page e2e tests run without exercising the real Google OAuth /
// session machinery (which is better-auth's concern, not ours to test).
//
// Two independent guards keep this safe:
//   - the env var is never set in production, and
//   - the cookie scopes the bypass to the test browser only (so, e.g., the
//     public-landing test still sees the unauthenticated site).
//
// The cookie value is the user id, so different test contexts can act as
// different users (e.g. one with seeded data, one empty).
export const E2E_USER_WITH_DATA = 'e2e-user-with-data'
export const E2E_USER_EMPTY = 'e2e-user-empty'

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

export function e2eBypassSession(headers: Headers): E2ESession | null {
  if (process.env.E2E_BYPASS_AUTH !== 'true') return null
  const cookie = headers.get('cookie') ?? ''
  const match = cookie.match(/(?:^|;\s*)e2e_auth=([^;]+)/)
  if (!match) return null
  const userId = decodeURIComponent(match[1].trim())
  return userId ? makeSession(userId) : null
}
