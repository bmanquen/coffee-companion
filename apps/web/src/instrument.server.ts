import * as Sentry from '@sentry/tanstackstart-react'
import pino from 'pino'
import { setLogSink } from '@coffee-companion/api/lib/log'
import { setErrorCapture } from '@coffee-companion/api/lib/report-error'
import {
  isAbortEvent,
  scrubSentryEvent,
  sentryCommonOptions,
  sentryEnabled,
  sentryServerDsn,
  trimSetting,
} from './lib/sentry'

const dsn = sentryServerDsn()
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
  setErrorCapture((error, { tags, user }) => {
    Sentry.captureException(error, { tags, user })
  })
}

export const logger = pino({
  level: trimSetting(process.env.LOG_LEVEL) ?? 'info',
  transport: import.meta.env.DEV ? { target: 'pino-pretty' } : undefined,
})

setLogSink((level, message, fields) => {
  logger[level](fields, message)
})
