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
    refetch: () => Promise<unknown>
  }
}

// getSession does not notify useSession, and the bypass body has no Set-Cookie
// for expoClient to pick up. Refetch the atom after writing the E2E cookie.
export async function refetchClientSession() {
  const session = (
    authClient as unknown as { $store: { atoms: { session: SessionAtom } } }
  ).$store.atoms.session
  await session.get().refetch()
  return session.get().data
}
