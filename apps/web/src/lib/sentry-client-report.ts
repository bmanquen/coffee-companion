// Dynamic import so the SSR router never loads Sentry's Node SDK.
export function reportClientError(error: unknown) {
  if (typeof window === 'undefined') return
  void import('@sentry/tanstackstart-react').then((Sentry) => {
    Sentry.captureException(error)
  })
}
