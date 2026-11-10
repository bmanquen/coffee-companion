import * as SecureStore from 'expo-secure-store'
import { E2E_AUTH_COOKIE_NAME } from './e2e'

export const SESSION_STORAGE_PREFIX = 'coffee-companion'
export const SESSION_COOKIE_KEY = `${SESSION_STORAGE_PREFIX}_cookie`
export const SESSION_DATA_KEY = `${SESSION_STORAGE_PREFIX}_session_data`

let explicitSessionWrites = 0
let sessionWriteGate: () => boolean = () => true

export function setSessionWriteGate(gate: () => boolean) {
  sessionWriteGate = gate
}

export function withExplicitSessionWrite<T>(fn: () => T): T {
  explicitSessionWrites += 1
  try {
    return fn()
  } finally {
    explicitSessionWrites -= 1
  }
}

function isSessionStoreKey(key: string) {
  return key === SESSION_COOKIE_KEY || key === SESSION_DATA_KEY
}

// expoClient's getCookie() JSON.parses this map into `name=value` headers.
export function e2eAuthCookieStore(userId: string): string {
  return JSON.stringify({
    [E2E_AUTH_COOKIE_NAME]: { value: userId, expires: null },
  })
}

export function e2eAuthUserFromCookieStore(raw: string | null): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<
      string,
      { value?: unknown } | undefined
    > | null
    const value = parsed?.[E2E_AUTH_COOKIE_NAME]?.value
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  } catch {
    return null
  }
}

export function writeE2EAuthCookie(userId: string): void {
  withExplicitSessionWrite(() => {
    sessionStore.setItem(SESSION_COOKIE_KEY, e2eAuthCookieStore(userId))
  })
}

export function readSessionCookie(): string | null {
  return sessionStore.getItem(SESSION_COOKIE_KEY)
}

export async function restoreSessionCookie(raw: string | null) {
  if (raw == null) {
    await SecureStore.deleteItemAsync(SESSION_COOKIE_KEY)
    return
  }
  withExplicitSessionWrite(() => {
    sessionStore.setItem(SESSION_COOKIE_KEY, raw)
  })
}

// Sync get/set: the Expo client plugin reads the cookie on every request.
export const sessionStore = {
  getItem: (key: string) => SecureStore.getItem(key),
  setItem: (key: string, value: string) => {
    if (
      explicitSessionWrites === 0 &&
      isSessionStoreKey(key) &&
      !sessionWriteGate()
    ) {
      return
    }
    SecureStore.setItem(key, value)
  },
}

export async function clearSessionStore() {
  await Promise.all([
    SecureStore.deleteItemAsync(SESSION_COOKIE_KEY),
    SecureStore.deleteItemAsync(SESSION_DATA_KEY),
  ])
}
