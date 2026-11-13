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
  setSessionWriteGate,
} from './session-store'

let authFetchEpoch = 0
let parsedAuthFetchEpoch: number | null = null

export function invalidatePendingAuthFetches() {
  authFetchEpoch += 1
}

export function sessionWriteAllowed() {
  if (parsedAuthFetchEpoch == null) return true
  return parsedAuthFetchEpoch === authFetchEpoch
}

export function applySessionAtomSet<T extends { data?: unknown }>(
  set: (value: T) => void,
  value: T,
) {
  if (value.data != null && !sessionWriteAllowed()) return
  set(value)
}

setSessionWriteGate(sessionWriteAllowed)

function noteParsedAuthFetchEpoch(epoch: number) {
  parsedAuthFetchEpoch = epoch
}

// expoClient and the session atom write after customFetchImpl returns.
function attachEpochGuard(response: Response, epoch: number): Response {
  const origJson = response.json.bind(response)
  const origText = response.text.bind(response)
  const origClone = response.clone.bind(response)
  response.json = async () => {
    const data = await origJson()
    noteParsedAuthFetchEpoch(epoch)
    return epoch !== authFetchEpoch ? null : data
  }
  response.text = async () => {
    const text = await origText()
    noteParsedAuthFetchEpoch(epoch)
    return epoch !== authFetchEpoch ? 'null' : text
  }
  response.clone = () => attachEpochGuard(origClone(), epoch)
  return response
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

function isStaleGetSession(epoch: number, url: string) {
  return epoch !== authFetchEpoch && isAuthGetSessionUrl(url)
}

async function emptyStaleGetSession(isDev: boolean) {
  const returned = emptyStaleGetSessionResponse()
  return {
    returned,
    sessionSummary: isDev
      ? await sessionSummaryFromResponse(returned)
      : undefined,
  }
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
    let returned = isStaleGetSession(epoch, url)
      ? emptyStaleGetSessionResponse()
      : response
    let sessionSummary = isDev
      ? await sessionSummaryFromResponse(returned)
      : undefined
    // Sign-out can bump the epoch while the summary clone is in flight.
    if (isStaleGetSession(epoch, url)) {
      const stale = await emptyStaleGetSession(isDev)
      returned = stale.returned
      sessionSummary = stale.sessionSummary
    }
    logAuthRequest(url, returned.status, isDev, headerInfo, sessionSummary)
    return attachEpochGuard(returned, epoch)
  } catch (error) {
    if (isStaleGetSession(epoch, url)) {
      const { returned, sessionSummary } = await emptyStaleGetSession(isDev)
      logAuthRequest(url, returned.status, isDev, headerInfo, sessionSummary)
      return attachEpochGuard(returned, epoch)
    }
    logAuthRequest(url, undefined, isDev, headerInfo)
    throw error
  }
}
