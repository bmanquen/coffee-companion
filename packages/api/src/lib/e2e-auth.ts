// Test-only authentication bypass for end-to-end tests.
//
// When E2E_BYPASS_AUTH=true AND the request carries an `e2e_auth=<userId>`
// cookie or `x-e2e-auth` header, the request is treated as authenticated as
// that user. This lets the authenticated-page e2e tests run without exercising
// the real Google OAuth / session machinery (which is better-auth's concern,
// not ours to test).
//
// Independent guards keep this safe:
//   - NODE_ENV must be exactly test or development (unset, production,
//     staging, and anything else refuse),
//   - the env var is never set in production, and
//   - the cookie/header scopes the bypass to the test client only (so, e.g.,
//     the public-landing test still sees the unauthenticated site).
//
// Playwright and verify-* boot the production *build* with NODE_ENV=test.
// `pnpm dev` is NODE_ENV=development. Property access on the env object
// keeps a production *build* honoring the process NODE_ENV at runtime
// (bundlers inline `process.env.NODE_ENV`).
//
// The value is the user id, so different test contexts can act as different
// users (e.g. one with seeded data, one empty). Native E2E also sends
// `x-e2e-auth` because React Native fetch treats Cookie as forbidden and the
// Expo client sets credentials: omit, so a SecureStore cookie map never
// arrives as a Cookie header the way a browser document cookie does.
import { e2eAuthAllowList } from './e2e-auth-allow-list'

export const E2E_AUTH_COOKIE_NAME = 'e2e_auth'
export const E2E_AUTH_HEADER = 'x-e2e-auth'
export const E2E_USER_WITH_DATA = 'e2e-user-with-data'
export const E2E_USER_EMPTY = 'e2e-user-empty'
// Holds the same library as E2E_USER_WITH_DATA but no Grant, so the two of them
// read the same rows on different Plans.
export const E2E_USER_FREE = 'e2e-user-free'
export const E2E_USER_DELETE = 'e2e-user-delete'

export const E2E_AUTH_ALLOWED_NODE_ENVS = ['development', 'test'] as const

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

export function isE2EAuthRuntime(env: { NODE_ENV?: string } = process.env) {
  return E2E_AUTH_ALLOWED_NODE_ENVS.some((allowed) => allowed === env.NODE_ENV)
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

for (const id of [
  E2E_USER_WITH_DATA,
  E2E_USER_EMPTY,
  E2E_USER_FREE,
  E2E_USER_DELETE,
]) {
  e2eAuthAllowList.add(id)
}

export function e2eBypassSession(headers: Headers): E2ESession | null {
  if (!isE2EAuthRuntime()) return null
  if (process.env.E2E_BYPASS_AUTH !== 'true') return null
  const userId = e2eAuthUserId(headers)
  return userId && e2eAuthAllowList.has(userId) ? makeSession(userId) : null
}
