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
//   - E2E_BYPASS_AUTH must be the string true,
//   - the cookie/header value must be an allow-listed persona id.
// The cookie/header selects which persona to act as. It is not an access
// boundary: any client that can reach a server with the bypass enabled can
// send it. Public-landing tests omit the credential so they see the
// unauthenticated site.
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
import {
  E2E_USER_DELETE,
  E2E_USER_EMPTY,
  E2E_USER_FREE,
  E2E_USER_WITH_DATA,
  e2eAuthAllowList,
} from './e2e-auth-allow-list'
import {
  E2E_AUTH_ALLOWED_NODE_ENVS,
  isDevOrTestRuntime,
} from './runtime-env'

export const E2E_AUTH_COOKIE_NAME = 'e2e_auth'
export const E2E_AUTH_HEADER = 'x-e2e-auth'
export {
  E2E_AUTH_ALLOWED_NODE_ENVS,
  E2E_USER_DELETE,
  E2E_USER_EMPTY,
  E2E_USER_FREE,
  E2E_USER_WITH_DATA,
  isDevOrTestRuntime,
}

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
  // A leftover or unknown cookie must not hide a valid x-e2e-auth header.
  if (fromCookie && e2eAuthAllowList.has(fromCookie)) return fromCookie
  return decodeE2EAuthValue(headers.get(E2E_AUTH_HEADER)?.trim())
}

export function e2eBypassSession(headers: Headers): E2ESession | null {
  if (!isDevOrTestRuntime()) return null
  if (process.env.E2E_BYPASS_AUTH !== 'true') return null
  const userId = e2eAuthUserId(headers)
  return userId && e2eAuthAllowList.has(userId) ? makeSession(userId) : null
}
