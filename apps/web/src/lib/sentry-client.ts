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

// Returns the import, so a caller that needs the user gone before it does
// anything else — sign-out — can wait for it.
export function setSentryUser(user: { id: string } | null) {
  return browserSentry()?.then((Sentry) => {
    Sentry.setUser(user)
  })
}
