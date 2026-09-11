import type { SentryUser } from './sentry'

// Dynamic import so the SSR router never loads Sentry's Node SDK.
function browserSentry() {
  if (typeof window === 'undefined') return undefined
  return import('@sentry/tanstackstart-react')
}

export function reportClientError(error: unknown) {
  void browserSentry()?.then((Sentry) => {
    Sentry.captureException(error)
  })
}

export function setSentryUser(user: SentryUser | undefined) {
  void browserSentry()?.then((Sentry) => {
    Sentry.setUser(user ?? null)
  })
}
