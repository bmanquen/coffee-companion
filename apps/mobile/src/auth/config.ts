import { Platform } from 'react-native'

export const APP_SCHEME = 'coffeecompanion'
export const APP_BUNDLE_ID = 'dev.offbyonelabs.coffeecompanion'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])
const ANDROID_EMULATOR_HOST = '10.0.2.2'

export function resolveApiBaseUrl(
  url: string,
  { os, isDev }: { os: string; isDev: boolean } = {
    os: Platform.OS,
    isDev: __DEV__,
  },
): string {
  if (!isDev || os !== 'android') return url

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) return url

  // The emulator's localhost is the guest; 10.0.2.2 is the host machine.
  parsed.hostname = ANDROID_EMULATOR_HOST
  const rewritten = parsed.toString()
  return url.endsWith('/') ? rewritten : rewritten.replace(/\/$/, '')
}

export function apiBaseUrl(): string {
  return resolveApiBaseUrl(
    process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
  )
}

export function googleWebClientId(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? ''
}

export function googleIosClientId(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? ''
}
