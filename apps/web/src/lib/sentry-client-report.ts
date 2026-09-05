// Dynamic so the SSR router never loads Sentry's Node SDK. instrument.client
// has already called init by the time a browser error boundary reports.
export function reportClientError(error: unknown) {
  if (typeof window === 'undefined') return
  void import('@sentry/tanstackstart-react').then((Sentry) => {
    Sentry.captureException(error)
  })
}
