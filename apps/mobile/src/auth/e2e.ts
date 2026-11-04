export const E2E_AUTH_COOKIE_NAME = 'e2e_auth'
export const E2E_AUTH_HEADER = 'x-e2e-auth'
export const E2E_USER_ENV = 'EXPO_PUBLIC_E2E_USER'
export const E2E_USER_WITH_DATA = 'e2e-user-with-data'
export const E2E_SIGN_IN = 'E2E sign in'

export function e2eSignInUser(
  user = process.env[E2E_USER_ENV],
  isDev = __DEV__,
): string | null {
  if (!isDev) return null
  return user ? user : null
}
