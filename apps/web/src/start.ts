import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from '@sentry/tanstackstart-react'
import { createStart } from '@tanstack/react-start'

// This app has no createServerFn routes, so the CSRF middleware Start would
// install for those does not apply. tRPC and Better Auth keep their own
// request handling. Sentry's middleware has to be first so a thrown
// request still gets captured.
export const startInstance = createStart(() => ({
  requestMiddleware: [sentryGlobalRequestMiddleware],
  functionMiddleware: [sentryGlobalFunctionMiddleware],
}))
