import {
  authResponseSessionSummary,
  hasE2EAuthHeader,
  headerNames,
  withE2EAuthHeader,
} from './e2e'
import {
  SESSION_COOKIE_KEY,
  e2eAuthUserFromCookieStore,
  sessionStore,
} from './session-store'

export const AUTH_LOG_PREFIX = '[auth]'

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

export function authErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  const code = error.code
  if (typeof code === 'string' && code) return code
  if (typeof code === 'number') return String(code)
  return null
}

export function authErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('message' in error)) return null
  return typeof error.message === 'string' && error.message ? error.message : null
}

export function nativeFailureDetail(error: unknown): {
  code: string | null
  message: string | null
} {
  return {
    code: authErrorCode(error),
    message: authErrorMessage(error),
  }
}

export function serverFailureDetail(error: unknown): {
  status: number | null
  code: string | null
  message: string | null
} {
  if (!error || typeof error !== 'object') {
    return { status: null, code: null, message: null }
  }
  const status =
    'status' in error && typeof error.status === 'number' ? error.status : null
  return {
    status,
    code: authErrorCode(error),
    message: authErrorMessage(error),
  }
}

function apiUrlTagForLog(tag: string): string {
  const sep = tag.indexOf(':')
  if (sep === -1) return authRequestUrlForLog(tag)
  const rest = tag.slice(sep + 1)
  if (!rest.includes('://') && !rest.startsWith('/')) return tag
  return `${tag.slice(0, sep + 1)}${authRequestUrlForLog(rest)}`
}

export function logApiBaseUrl(
  url: string,
  tag?: string,
  isDev = __DEV__,
) {
  if (!isDev) return
  const extra = tag ? ` ${apiUrlTagForLog(tag)}` : ''
  console.log(`${AUTH_LOG_PREFIX} api-url ${authRequestUrlForLog(url)}${extra}`)
}

export function authRequestUrlForLog(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return `${parsed.origin}${path}`
  } catch {
    const withoutHash = url.split('#')[0] ?? url
    const query = withoutHash.indexOf('?')
    return query === -1 ? withoutHash : withoutHash.slice(0, query)
  }
}

export function logAuthRequest(
  url: string,
  status?: number,
  isDev = __DEV__,
  headerInfo?: { names: Array<string>; e2eAuth: boolean },
  sessionSummary?: string,
) {
  if (!isDev) return
  if (!url) return
  const parts = [`${AUTH_LOG_PREFIX} request ${authRequestUrlForLog(url)}`]
  if (status != null) parts.push(`status=${status}`)
  if (headerInfo) {
    parts.push(`headers=${headerInfo.names.join(',') || 'none'}`)
    parts.push(`e2e-auth=${headerInfo.e2eAuth ? '1' : '0'}`)
  }
  if (sessionSummary) parts.push(`session=${sessionSummary}`)
  console.log(parts.join(' '))
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
    const staleGetSession =
      epoch !== authFetchEpoch && isAuthGetSessionUrl(url)
    const returned = staleGetSession
      ? new Response('null', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      : response
    const sessionSummary = isDev
      ? await sessionSummaryFromResponse(returned)
      : undefined
    logAuthRequest(url, returned.status, isDev, headerInfo, sessionSummary)
    return returned
  } catch (error) {
    logAuthRequest(url, undefined, isDev, headerInfo)
    throw error
  }
}

export function logAuthFailure(
  kind: string,
  detail: {
    status?: number | null
    code?: string | number | null
    message?: string | null
  },
  isDev = __DEV__,
) {
  if (!isDev) return
  const parts = [`${AUTH_LOG_PREFIX} ${kind}:`]
  if (detail.status != null) parts.push(`status=${detail.status}`)
  if (detail.code != null && detail.code !== '') parts.push(`code=${detail.code}`)
  if (detail.message) parts.push(`message=${detail.message}`)
  console.error(parts.join(' '))
}
