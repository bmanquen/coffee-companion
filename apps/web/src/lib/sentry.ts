// Shared Sentry options. Init is skipped when no DSN is set, so a fresh clone
// and CI run without monitoring and without crashing. The client only sees the
// Vite-prefixed DSN; the server reads SENTRY_DSN. They are the same ingest
// URL for one project, written twice because the browser is not allowed the
// unprefixed name.

const SENSITIVE_HEADER =
  /^(cookie|set-cookie|authorization|proxy-authorization|x-api-key|stripe-signature)$/i

const SENSITIVE_KEY =
  /^(password|passwd|secret|token|api[_-]?key|authorization|cookie|email|e-mail|phone|stripe[_-]?(secret|webhook)|resend[_-]?api[_-]?key)$/i

export type SentryUser = {
  id?: string | number
  email?: string
  username?: string
  ip_address?: string
}

export type SentryRequest = {
  cookies?: unknown
  data?: unknown
  headers?: Record<string, string>
}

export type SentryEventLike = {
  user?: SentryUser
  request?: SentryRequest
  extra?: Record<string, unknown>
}

export function trimDsn(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

export function sentryClientDsn(): string | undefined {
  return trimDsn(import.meta.env.VITE_SENTRY_DSN)
}

export function sentryServerDsn(): string | undefined {
  if (typeof process === 'undefined') return undefined
  return trimDsn(process.env.SENTRY_DSN)
}

export function sentryEnabled(dsn: string | undefined): dsn is string {
  return dsn != null
}

export function sentryEnvironment(): string {
  if (typeof process !== 'undefined') {
    return (
      trimDsn(process.env.SENTRY_ENVIRONMENT) ??
      trimDsn(process.env.NODE_ENV) ??
      'development'
    )
  }
  return import.meta.env.MODE || 'development'
}

export function sentryCommonOptions(dsn: string) {
  return {
    dsn,
    environment: sentryEnvironment(),
    sendDefaultPii: false,
  }
}

export function scrubSentryEvent<T>(event: T): T {
  const next = event as T & SentryEventLike

  if (next.user) {
    next.user = next.user.id != null ? { id: next.user.id } : undefined
  }

  if (next.request) {
    if (next.request.cookies) delete next.request.cookies
    if ('data' in next.request) delete next.request.data
    if (next.request.headers) {
      next.request.headers = Object.fromEntries(
        Object.entries(next.request.headers).filter(
          ([key]) => !SENSITIVE_HEADER.test(key),
        ),
      )
    }
  }

  if (next.extra) {
    next.extra = scrubRecord(next.extra)
  }

  return event
}

function scrubRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[Filtered]' : value,
    ]),
  )
}
