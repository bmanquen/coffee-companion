import * as Sentry from '@sentry/tanstackstart-react'
import {
  isAbortEvent,
  scrubSentryEvent,
  sentryBrowserOptions,
  sentryClientDsn,
  sentryEnabled,
} from './lib/sentry'

const dsn = sentryClientDsn()
if (sentryEnabled(dsn)) {
  const { init, replay } = sentryBrowserOptions(dsn)
  Sentry.init({
    ...init,
    integrations: [Sentry.replayIntegration(replay)],
    beforeSend(event) {
      if (isAbortEvent(event)) return null
      return scrubSentryEvent(event)
    },
    beforeSendTransaction(event) {
      return scrubSentryEvent(event)
    },
  })
}
