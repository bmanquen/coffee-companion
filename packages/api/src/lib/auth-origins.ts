export const APP_SCHEME_ORIGIN = 'coffeecompanion://'
export const EXPO_DEV_ORIGIN = 'exp://'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])
const ANDROID_EMULATOR_HOST = '10.0.2.2'

function androidEmulatorOrigin(baseURL: string): string | null {
  try {
    const url = new URL(baseURL)
    if (!LOOPBACK_HOSTS.has(url.hostname)) return null
    url.hostname = ANDROID_EMULATOR_HOST
    return url.origin
  } catch {
    return null
  }
}

// Expo’s bundler speaks exp://. That origin is a development client, not a
// production install, so production must not treat it as trusted. The Android
// emulator reaches a loopback BETTER_AUTH_URL via 10.0.2.2, so that host is
// trusted only outside production.
export function trustedAuthOrigins(
  baseURL: string,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): Array<string> {
  if (nodeEnv === 'production') return [baseURL, APP_SCHEME_ORIGIN]
  const origins = [baseURL, APP_SCHEME_ORIGIN, EXPO_DEV_ORIGIN]
  const emulatorOrigin = androidEmulatorOrigin(baseURL)
  if (emulatorOrigin && !origins.includes(emulatorOrigin)) {
    origins.push(emulatorOrigin)
  }
  return origins
}
