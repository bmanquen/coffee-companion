import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { trpcRouter } from '@coffee-companion/api/trpc/router'
import { createFileRoute } from '@tanstack/react-router'
import * as Sentry from '@sentry/tanstackstart-react'
import { reportTrpcError } from '@/lib/sentry-trpc'

function handler({ request }: { request: Request }) {
  return fetchRequestHandler({
    req: request,
    router: trpcRouter,
    endpoint: '/api/trpc',
    createContext: () => ({ headers: request.headers }),
    onError: ({ error, path, ctx }) => {
      reportTrpcError(error, path, ctx, (exception, context) => {
        Sentry.captureException(exception, context)
      })
    },
  })
}

export const Route = createFileRoute('/api/trpc/$')({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
})
