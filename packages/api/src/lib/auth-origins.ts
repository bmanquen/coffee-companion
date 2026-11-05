import { E2E_AUTH_ALLOWED_NODE_ENVS } from './e2e-auth'

export const APP_SCHEME_ORIGIN = 'coffeecompanion://'
export const EXPO_DEV_ORIGIN = 'exp://'
export const EXPO_DEV_CLIENT_ORIGIN = 'exp+coffee-companion://'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])
const ANDROID_EMULATOR_HOST = '10.0.2.2'
const LOOPBACK_ALIAS_HOSTS = ['localhost', '127.0.0.1', ANDROID_EMULATOR_HOST]

function loopbackAliasOrigins(baseURL: string): Array<string> {
  try {
    const url = new URL(baseURL)
    if (
      !LOOPBACK_HOSTS.has(url.hostname) &&
      url.hostname !== ANDROID_EMULATOR_HOST
    ) {
      return []
    }
    return LOOPBACK_ALIAS_HOSTS.map((host) => {
      url.hostname = host
      return url.origin
    })
  } catch {
    return []
  }
}

// Expo’s bundler speaks exp://. The development client uses exp+<slug>://.
// Those origins are development clients, not a production install, so only
// development and test treat them as trusted. A loopback BETTER_AUTH_URL is
// reached as localhost, 127.0.0.1 (adb reverse), or 10.0.2.2 under the same
// allow-list. Unset, staging, and production stay on the app scheme.
export function trustedAuthOrigins(
  baseURL: string,
  env: { NODE_ENV?: string } = process.env,
): Array<string> {
  if (!E2E_AUTH_ALLOWED_NODE_ENVS.some((allowed) => allowed === env.NODE_ENV)) {
    return [baseURL, APP_SCHEME_ORIGIN]
  }
  const origins = [
    baseURL,
    APP_SCHEME_ORIGIN,
    EXPO_DEV_ORIGIN,
    EXPO_DEV_CLIENT_ORIGIN,
  ]
  for (const origin of loopbackAliasOrigins(baseURL)) {
    if (!origins.includes(origin)) origins.push(origin)
  }
  return origins
}
