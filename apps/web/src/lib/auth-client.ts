import { createAuthClient } from 'better-auth/react'
import { stripeClient } from '@better-auth/stripe/client'

export const authClient = createAuthClient({
  // Gives the client subscription.upgrade(), which asks the server for a
  // Checkout Session and follows the redirect it answers with.
  plugins: [stripeClient({ subscription: true })],
  // Client and API share an origin. In the browser, derive it from the current
  // location; during SSR fetch needs an absolute URL, so use the runtime env
  // (BETTER_AUTH_URL), defaulting to localhost.
  baseURL:
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'),
})
