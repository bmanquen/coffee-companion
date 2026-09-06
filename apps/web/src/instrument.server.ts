import * as Sentry from '@sentry/tanstackstart-react'
import { setErrorCapture } from '@coffee-companion/api/lib/report-error'
import {
  scrubSentryEvent,
  sentryCommonOptions,
  sentryEnabled,
  sentryServerDsn,
} from './lib/sentry'

const dsn = sentryServerDsn()
if (sentryEnabled(dsn)) {
  Sentry.init({
    ...sentryCommonOptions(dsn),
    beforeSend(event) {
      return scrubSentryEvent(event)
    },
  })
  setErrorCapture((error, tags) => {
    Sentry.captureException(error, { tags })
  })
}
