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

function stripLogUrlUserinfo(url: string): string {
  return url.replace(/^((?:[a-z][a-z\d+.-]*:)?\/\/)[^/?#]*@/i, '$1')
}

export function authRequestUrlForLog(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return `${parsed.origin}${path}`
  } catch {
    const withoutHash = url.split('#')[0] ?? url
    const withoutUserinfo = stripLogUrlUserinfo(withoutHash)
    const query = withoutUserinfo.indexOf('?')
    return query === -1
      ? withoutUserinfo
      : withoutUserinfo.slice(0, query)
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
