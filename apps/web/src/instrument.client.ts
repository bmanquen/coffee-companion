import * as Sentry from '@sentry/tanstackstart-react'
import {
  isAbortEvent,
  scrubSentryEvent,
  sentryClientDsn,
  sentryCommonOptions,
  sentryEnabled,
} from './lib/sentry'

const dsn = sentryClientDsn()
if (sentryEnabled(dsn)) {
  Sentry.init({
    ...sentryCommonOptions(dsn),
    beforeSend(event) {
      if (isAbortEvent(event)) return null
      return scrubSentryEvent(event)
    },
    beforeSendTransaction(event) {
      return scrubSentryEvent(event)
    },
  })
}
