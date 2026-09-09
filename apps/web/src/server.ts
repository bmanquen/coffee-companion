// eslint-disable-next-line import/order -- Sentry must initialise before the handler's modules load
import { logger } from './instrument.server'

import * as Sentry from '@sentry/tanstackstart-react'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { withRequestLog } from './lib/request-log'

export default createServerEntry(
  withRequestLog(
    Sentry.wrapFetchWithSentry({
      fetch(request, opts) {
        return handler.fetch(
          request,
          opts as Parameters<typeof handler.fetch>[1],
        )
      },
    }),
    {
      log: (record) => logger.info(record, 'request'),
      tag: (id) => Sentry.getIsolationScope().setTag('request_id', id),
    },
  ),
)
