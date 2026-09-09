// Same project settings, two names: the browser may only see the VITE_ twins.

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
  exception?: { values?: Array<{ type?: string }> }
}

export function trimSetting(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

export function sentryClientDsn(): string | undefined {
  return trimSetting(import.meta.env.VITE_SENTRY_DSN)
}

export function sentryServerDsn(): string | undefined {
  if (typeof process === 'undefined') return undefined
  return trimSetting(process.env.SENTRY_DSN)
}

export function sentryEnabled(dsn: string | undefined): dsn is string {
  return dsn != null
}

export function sentryEnvironment(): string {
  if (typeof process !== 'undefined') {
    return (
      trimSetting(process.env.SENTRY_ENVIRONMENT) ??
      trimSetting(process.env.NODE_ENV) ??
      'development'
    )
  }
  return import.meta.env.MODE || 'development'
}

export function traceSampleRate(
  value: string | undefined,
  environment: string,
): number {
  const fallback = environment === 'production' ? 0.1 : 1
  const trimmed = trimSetting(value)
  if (trimmed === undefined) return fallback
  const rate = Number(trimmed)
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) return fallback
  return rate
}

export function sentryTracesSampleRate(): number {
  const value =
    typeof process !== 'undefined'
      ? process.env.SENTRY_TRACES_SAMPLE_RATE
      : import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE
  return traceSampleRate(value, sentryEnvironment())
}

export function sentryCommonOptions(dsn: string) {
  return {
    dsn,
    environment: sentryEnvironment(),
    sendDefaultPii: false,
    tracesSampleRate: sentryTracesSampleRate(),
  }
}

// A cancelled request is not a failure. `httpBatchStreamLink` aborts its own
// controller once a batch's stream is drained, and WebKit reports that teardown
// as an unhandled `AbortError: Fetch is aborted` after the request already
// returned 200 — noise, and never actionable.
export function isAbortEvent<T>(event: T): boolean {
  const values = (event as T & SentryEventLike).exception?.values
  if (!values?.length) return false
  return values.every((value) => value.type === 'AbortError')
}

// Sentry attaches cookies, bodies, and emails unless we strip them —
// easy to drop.
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
  return scrubValue(record, new WeakSet()) as Record<string, unknown>
}

const MAX_SCRUB_DEPTH = 10

function scrubValue(value: unknown, seen: WeakSet<object>, depth = 0): unknown {
  if (value == null || typeof value !== 'object') return value
  if (value instanceof Date || value instanceof RegExp) return value
  if (depth >= MAX_SCRUB_DEPTH || seen.has(value)) return '[Truncated]'
  seen.add(value)

  const next = depth + 1
  if (Array.isArray(value) || value instanceof Set) {
    return Array.from(value, (item) => scrubValue(item, seen, next))
  }

  const entries: Array<[string, unknown]> =
    value instanceof Map
      ? Array.from(value, ([key, item]) => [String(key), item])
      : Object.entries(value)
  if (value instanceof Error) {
    entries.unshift(
      ['name', value.name],
      ['message', value.message],
      ['stack', value.stack],
    )
  }

  return Object.fromEntries(
    entries.map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[Filtered]' : scrubValue(item, seen, next),
    ]),
  )
}
