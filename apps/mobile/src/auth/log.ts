export const AUTH_LOG_PREFIX = '[auth]'

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

export function logApiBaseUrl(
  url: string,
  tag?: string,
  isDev = __DEV__,
) {
  if (!isDev) return
  const extra = tag ? ` ${tag}` : ''
  console.log(`${AUTH_LOG_PREFIX} api-url ${url}${extra}`)
}

export function logAuthRequest(
  url: string,
  status?: number,
  isDev = __DEV__,
) {
  if (!isDev) return
  if (!url) return
  const parts = [`${AUTH_LOG_PREFIX} request ${url}`]
  if (status != null) parts.push(`status=${status}`)
  console.log(parts.join(' '))
}

export async function loggedAuthFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  isDev = __DEV__,
  impl: typeof fetch = globalThis.fetch,
): Promise<Response> {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  try {
    const response = await impl(input as RequestInfo, init)
    logAuthRequest(url, response.status, isDev)
    return response
  } catch (error) {
    logAuthRequest(url, undefined, isDev)
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
