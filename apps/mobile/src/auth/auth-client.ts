import { createAuthClient } from 'better-auth/react'
import { expoClient } from '@better-auth/expo/client'
import { APP_SCHEME, apiBaseUrl } from './config'
import { loggedAuthFetch } from './log'
import { SESSION_STORAGE_PREFIX, sessionStore } from './session-store'
import type { BetterAuthClientPlugin } from 'better-auth/client'

export const authClient = createAuthClient({
  baseURL: apiBaseUrl(),
  fetchOptions: {
    customFetchImpl: ((input: RequestInfo | URL, init?: RequestInit) =>
      loggedAuthFetch(input, init)) as never,
  },
  plugins: [
    // 1.6.26 types reject expoClient; runtime is fine. See better-auth#10571.
    expoClient({
      scheme: APP_SCHEME,
      storagePrefix: SESSION_STORAGE_PREFIX,
      storage: sessionStore,
    }) as BetterAuthClientPlugin,
  ],
})

type SessionAtom = {
  get: () => {
    data: { user?: { id?: string } | null } | null
    error: unknown
    isPending: boolean
    isRefetching: boolean
    refetch: () => Promise<unknown>
  }
  set: (value: {
    data: { user?: { id?: string } | null } | null
    error: unknown
    isPending: boolean
    isRefetching: boolean
    refetch: () => Promise<unknown>
  }) => void
}

// better-auth 1.6.26: useSession does not see a cookie-only bypass until this
// store atom is refetched. Keep one cast so the e2e path test cannot drift.
export function sessionAtom() {
  return (
    authClient as unknown as { $store: { atoms: { session: SessionAtom } } }
  ).$store.atoms.session
}

// getSession does not notify useSession, and the bypass body has no Set-Cookie
// for expoClient to pick up. Refetch the atom after writing the E2E cookie.
export async function refetchClientSession() {
  const session = sessionAtom()
  await session.get().refetch()
  return session.get().data
}

// signOut's delayed get-session can re-read the E2E cookie before SecureStore
// delete finishes. Force the atom empty after the store is cleared.
export function clearClientSession() {
  const session = sessionAtom()
  const current = session.get()
  session.set({
    data: null,
    error: null,
    isPending: false,
    isRefetching: false,
    refetch: current.refetch,
  })
}
