import { Platform } from 'react-native'

export const APP_SCHEME = 'coffeecompanion'
export const APP_BUNDLE_ID = 'dev.offbyonelabs.coffeecompanion'

const ANDROID_EMULATOR_REWRITE_HOSTS = new Set(['localhost'])
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
  if (!ANDROID_EMULATOR_REWRITE_HOSTS.has(parsed.hostname)) return url

  // localhost on the guest is the emulator itself. 127.0.0.1 stays so adb reverse
  // can reach the host; 10.0.2.2 is the alias when reverse is not in play.
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
