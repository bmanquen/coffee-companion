export const E2E_AUTH_COOKIE_NAME = 'e2e_auth'
export const E2E_AUTH_HEADER = 'x-e2e-auth'
export const E2E_USER_ENV = 'EXPO_PUBLIC_E2E_USER'
export const E2E_USER_WITH_DATA = 'e2e-user-with-data'
export const E2E_USER_EMPTY = 'e2e-user-empty'
export const E2E_USER_FREE = 'e2e-user-free'
export const E2E_USER_DELETE = 'e2e-user-delete'
export const E2E_SIGN_IN = 'E2E sign in'

const E2E_PERSONA_IDS = new Set([
  E2E_USER_WITH_DATA,
  E2E_USER_EMPTY,
  E2E_USER_FREE,
  E2E_USER_DELETE,
])

export function e2eSignInUser(
  user = process.env.EXPO_PUBLIC_E2E_USER,
  isDev = __DEV__,
): string | null {
  if (!isDev) return null
  return user ? user : null
}

export function headerNames(headers: HeadersInit | undefined): Array<string> {
  return [...new Headers(headers).keys()].sort()
}

export function hasE2EAuthHeader(headers: HeadersInit | undefined): boolean {
  return Boolean(new Headers(headers).get(E2E_AUTH_HEADER)?.trim())
}

export function authResponseSessionSummary(body: unknown): string {
  if (body == null) return 'null'
  if (typeof body !== 'object') return 'non-object'
  const user = (body as { user?: { id?: unknown } | null }).user
  if (user == null) return 'user=null'
  if (typeof user === 'object' && typeof user.id === 'string' && user.id) {
    // Ordinary ids are PII in a shared log; E2E personas are the allow-list.
    return E2E_PERSONA_IDS.has(user.id) ? `user=${user.id}` : 'user=present'
  }
  return 'user=missing-id'
}

// Expo's fetch plugin init runs last and replaces options; RN fetch also
// drops Cookie. Set x-e2e-auth on the Headers object that actually goes out.
export function withE2EAuthHeader(
  init: RequestInit | undefined,
  userId: string | null,
  isDev = __DEV__,
): RequestInit {
  if (!isDev || !userId) return init ?? {}
  const headers = new Headers(init?.headers)
  headers.set(E2E_AUTH_HEADER, userId)
  return { ...init, headers }
}
