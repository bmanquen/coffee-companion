import { createAuthClient } from 'better-auth/react'
import { expoClient } from '@better-auth/expo/client'
import {
  adoptCurrentAuthFetchEpoch,
  applySessionAtomSet,
  invalidatePendingAuthFetches,
  loggedAuthFetch,
} from './auth-fetch'
import { APP_SCHEME, apiBaseUrl } from './config'
import {
  SESSION_COOKIE_KEY,
  SESSION_DATA_KEY,
  SESSION_STORAGE_PREFIX,
  sessionStore,
  withExplicitSessionWrite,
} from './session-store'
import type { BetterAuthClientPlugin } from 'better-auth/client'

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

function isSignOutRequest(url: string) {
  try {
    return new URL(url, 'http://127.0.0.1').pathname.endsWith('/sign-out')
  } catch {
    return url.includes('/sign-out')
  }
}

let signOutSnapshot: {
  cookie: string | null
  sessionData: string | null
  atom: ReturnType<SessionAtom['get']>
} | null = null

function restoreSignOutSnapshot() {
  const held = signOutSnapshot
  signOutSnapshot = null
  if (!held) return
  // Cookie-less get-session calls started while expo had cleared storage
  // must not commit after this restore.
  invalidatePendingAuthFetches()
  adoptCurrentAuthFetchEpoch()
  withExplicitSessionWrite(() => {
    if (held.cookie != null) {
      sessionStore.setItem(SESSION_COOKIE_KEY, held.cookie)
    }
    if (held.sessionData != null) {
      sessionStore.setItem(SESSION_DATA_KEY, held.sessionData)
    }
  })
  sessionAtom().set(held.atom)
}

const preserveSessionOnFailedSignOut = {
  id: 'preserve-session-on-failed-sign-out',
  name: 'Preserve session on failed sign-out',
  init(url: string, options?: object) {
    // expoClient clears the cookie and session cache in /sign-out init.
    if (isSignOutRequest(url)) {
      signOutSnapshot = {
        cookie: sessionStore.getItem(SESSION_COOKIE_KEY),
        sessionData: sessionStore.getItem(SESSION_DATA_KEY),
        atom: sessionAtom().get(),
      }
    }
    return { url, options }
  },
  hooks: {
    onSuccess(context: { request?: { url?: string } }) {
      const url = String(context.request?.url ?? '')
      if (isSignOutRequest(url)) signOutSnapshot = null
    },
    onError(context: { request?: { url?: string } }) {
      if (isSignOutRequest(String(context.request?.url ?? ''))) {
        restoreSignOutSnapshot()
      }
    },
  },
}

export const authClient = createAuthClient({
  baseURL: apiBaseUrl(),
  fetchOptions: {
    customFetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        return await loggedAuthFetch(input, init)
      } catch (error) {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url
        if (isSignOutRequest(url)) restoreSignOutSnapshot()
        throw error
      }
    }) as never,
    plugins: [preserveSessionOnFailedSignOut] as never,
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

// better-auth 1.6.26: useSession does not see a cookie-only bypass until this
// store atom is refetched. Keep one cast so the e2e path test cannot drift.
let guardedSessionAtom: SessionAtom | null = null

export function sessionAtom() {
  const atom = (
    authClient as unknown as { $store: { atoms: { session: SessionAtom } } }
  ).$store.atoms.session
  if (guardedSessionAtom !== atom) {
    const inner = atom.set.bind(atom)
    atom.set = (value) => applySessionAtomSet(inner, value)
    guardedSessionAtom = atom
  }
  return atom
}

// Wrap atom.set before the first get-session can return.
sessionAtom()

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
  // Drop in-flight get-session bodies so a late 200 cannot refill the atom
  // or the Expo session cache after sign-out.
  invalidatePendingAuthFetches()
  adoptCurrentAuthFetchEpoch()
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

export function getSessionCookie(): string {
  return authClient.getCookie()
}
