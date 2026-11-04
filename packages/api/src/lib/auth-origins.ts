export const APP_SCHEME_ORIGIN = 'coffeecompanion://'
export const EXPO_DEV_ORIGIN = 'exp://'

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

// Expo’s bundler speaks exp://. That origin is a development client, not a
// production install, so production must not treat it as trusted. A loopback
// BETTER_AUTH_URL is reached as localhost, 127.0.0.1 (adb reverse), or
// 10.0.2.2, and those hosts are trusted only outside production.
export function trustedAuthOrigins(
  baseURL: string,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): Array<string> {
  if (nodeEnv === 'production') return [baseURL, APP_SCHEME_ORIGIN]
  const origins = [baseURL, APP_SCHEME_ORIGIN, EXPO_DEV_ORIGIN]
  for (const origin of loopbackAliasOrigins(baseURL)) {
    if (!origins.includes(origin)) origins.push(origin)
  }
  return origins
}
