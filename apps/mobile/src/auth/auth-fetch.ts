import {
  authResponseSessionSummary,
  hasE2EAuthHeader,
  headerNames,
  withE2EAuthHeader,
} from './e2e'
import { logAuthRequest } from './log'
import {
  SESSION_COOKIE_KEY,
  e2eAuthUserFromCookieStore,
  sessionStore,
} from './session-store'

let authFetchEpoch = 0

export function invalidatePendingAuthFetches() {
  authFetchEpoch += 1
}

function isAuthGetSessionUrl(url: string): boolean {
  try {
    return new URL(url, 'http://127.0.0.1').pathname.endsWith('/get-session')
  } catch {
    return url.includes('/get-session')
  }
}

function emptyStaleGetSessionResponse() {
  return new Response('null', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

async function sessionSummaryFromResponse(response: Response): Promise<string> {
  try {
    const text = await response.clone().text()
    if (!text) return 'empty'
    try {
      return authResponseSessionSummary(JSON.parse(text) as unknown)
    } catch {
      return 'non-json'
    }
  } catch {
    return 'unreadable'
  }
}

function mergeRequestInit(
  input: RequestInfo | URL,
  init?: RequestInit,
): RequestInit {
  const headers = new Headers(
    input instanceof Request ? input.headers : undefined,
  )
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value)
    })
  }
  return { ...init, headers }
}

export async function loggedAuthFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  isDev = __DEV__,
  impl: typeof fetch = globalThis.fetch,
): Promise<Response> {
  const userId = isDev
    ? e2eAuthUserFromCookieStore(sessionStore.getItem(SESSION_COOKIE_KEY))
    : null
  const next = isDev
    ? withE2EAuthHeader(mergeRequestInit(input, init), userId, isDev)
    : (init ?? {})
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  const headerInfo = isDev
    ? {
        names: headerNames(next.headers),
        e2eAuth: hasE2EAuthHeader(next.headers),
      }
    : undefined
  const epoch = authFetchEpoch
  try {
    const response = await impl(input as RequestInfo, next)
    let returned =
      epoch !== authFetchEpoch && isAuthGetSessionUrl(url)
        ? emptyStaleGetSessionResponse()
        : response
    let sessionSummary = isDev
      ? await sessionSummaryFromResponse(returned)
      : undefined
    // Sign-out can bump the epoch while the summary clone is in flight.
    if (epoch !== authFetchEpoch && isAuthGetSessionUrl(url)) {
      returned = emptyStaleGetSessionResponse()
      sessionSummary = isDev
        ? await sessionSummaryFromResponse(returned)
        : undefined
    }
    logAuthRequest(url, returned.status, isDev, headerInfo, sessionSummary)
    return returned
  } catch (error) {
    if (epoch !== authFetchEpoch && isAuthGetSessionUrl(url)) {
      const returned = emptyStaleGetSessionResponse()
      const sessionSummary = isDev
        ? await sessionSummaryFromResponse(returned)
        : undefined
      logAuthRequest(url, returned.status, isDev, headerInfo, sessionSummary)
      return returned
    }
    logAuthRequest(url, undefined, isDev, headerInfo)
    throw error
  }
}
