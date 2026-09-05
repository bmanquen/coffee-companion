import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { trpcRouter } from '@coffee-companion/api/trpc/router'
import { reportError } from '@coffee-companion/api/lib/report-error'
import { createFileRoute } from '@tanstack/react-router'
import { reportTrpcError } from '@/lib/sentry-trpc'

function handler({ request }: { request: Request }) {
  return fetchRequestHandler({
    req: request,
    router: trpcRouter,
    endpoint: '/api/trpc',
    createContext: () => ({ headers: request.headers }),
    onError: ({ error, path, ctx }) => {
      // Goes through the API reporter, not a Sentry import: this file sits
      // in the route tree, and a static Sentry import here loads the Node
      // SDK into the SSR router chunk.
      reportTrpcError(error, path, ctx, (exception, context) => {
        reportError(exception, context.tags)
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
