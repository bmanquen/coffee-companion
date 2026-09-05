import * as Sentry from '@sentry/tanstackstart-react'
import {
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
      return scrubSentryEvent(event)
    },
  })
}
