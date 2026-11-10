import { Platform } from 'react-native'

export const APP_SCHEME = 'coffeecompanion'
export const APP_BUNDLE_ID = 'dev.offbyonelabs.coffeecompanion'
export const FALLBACK_API_URL = 'http://localhost:3000'
export const API_URL_DEV_TAG_PREFIX = 'cc-api-url:'

const ANDROID_EMULATOR_REWRITE_HOSTS = new Set(['localhost'])
const ANDROID_EMULATOR_HOST = '10.0.2.2'

export function configuredApiUrl(
  envUrl: string | undefined = process.env.EXPO_PUBLIC_API_URL,
): string {
  return envUrl || FALLBACK_API_URL
}

export function apiUrlDevTag(url = configuredApiUrl()): string {
  return `${API_URL_DEV_TAG_PREFIX}${url}`
}

// Production babel stringifies EXPO_PUBLIC_*. Dev rewrites it to expo/virtual/env
// (HMR), so the contiguous cc-api-url:<url> tag only appears after that rewrite
// plus the serializer polyfill / .env files. extra.apiUrl is not this tag.
export const API_URL_DEV_TAG = `${API_URL_DEV_TAG_PREFIX}${process.env.EXPO_PUBLIC_API_URL || FALLBACK_API_URL}`

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
  return resolveApiBaseUrl(configuredApiUrl())
}

export function googleWebClientId(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? ''
}

export function googleIosClientId(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? ''
}
