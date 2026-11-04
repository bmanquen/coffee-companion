import { createAuthClient } from 'better-auth/react'
import { expoClient } from '@better-auth/expo/client'
import { APP_SCHEME, apiBaseUrl } from './config'
import { E2E_AUTH_HEADER } from './e2e'
import { loggedAuthFetch } from './log'
import {
  SESSION_COOKIE_KEY,
  SESSION_STORAGE_PREFIX,
  e2eAuthUserFromCookieStore,
  sessionStore,
} from './session-store'
import type { BetterAuthClientPlugin } from 'better-auth/client'

function mergeRequestHeaders(
  headers: unknown,
  extra: Record<string, string>,
): Record<string, string> {
  const fromHeaders =
    headers instanceof Headers
      ? Object.fromEntries(headers.entries())
      : Array.isArray(headers)
        ? Object.fromEntries(headers)
        : headers && typeof headers === 'object'
          ? Object.fromEntries(
              Object.entries(headers as Record<string, unknown>).filter(
                (entry): entry is [string, string] => typeof entry[1] === 'string',
              ),
            )
          : {}
  return { ...fromHeaders, ...extra }
}

const e2eAuthHeaderPlugin = {
  id: 'e2e-auth-header',
  name: 'e2e-auth-header',
  init(url: string, options?: { headers?: unknown }) {
    const userId = e2eAuthUserFromCookieStore(
      sessionStore.getItem(SESSION_COOKIE_KEY),
    )
    if (!userId) return { url, options }
    const next = options ?? {}
    next.headers = mergeRequestHeaders(next.headers, {
      [E2E_AUTH_HEADER]: userId,
    })
    return { url, options: next }
  },
}

export const authClient = createAuthClient({
  baseURL: apiBaseUrl(),
  fetchOptions: {
    customFetchImpl: ((input: RequestInfo | URL, init?: RequestInit) =>
      loggedAuthFetch(input, init)) as never,
    // better-fetch plugin headers are a branded record, not HeadersInit.
    plugins: [e2eAuthHeaderPlugin as never],
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
