import './instrument.server'

import { wrapFetchWithSentry } from '@sentry/tanstackstart-react'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

export default createServerEntry(
  wrapFetchWithSentry({
    fetch(request, opts) {
      return handler.fetch(request, opts as Parameters<typeof handler.fetch>[1])
    },
  }),
)
