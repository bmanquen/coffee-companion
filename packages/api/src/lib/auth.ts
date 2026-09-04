import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from 'better-auth/api'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { stripe } from '@better-auth/stripe'
import { db } from '../db'
import * as schema from '../db/auth-schema'
import {
  billingConfig,
  hasLiveSubscription,
  managedPaymentsParams,
} from './billing'

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'

// Resolved here, at import, so a deployment missing a price fails on the way up
// rather than under the first customer to press Subscribe. Null switches
// billing off entirely, which is how a fresh clone and CI run.
const billing = billingConfig()

export const auth = betterAuth({
  baseURL,
  trustedOrigins: [baseURL],
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  hooks: {
    // A user holds one Subscription at a time. Changing it is the billing
    // portal's job; Checkout only ever sells the first one.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/subscription/upgrade') return
      const found = await getSessionFromCtx<{
        stripeCustomerId?: string | null
      }>(ctx)
      const customerId = found?.user.stripeCustomerId
      if (!customerId || !(await hasLiveSubscription(customerId))) return
      throw new APIError('BAD_REQUEST', {
        code: 'ALREADY_SUBSCRIBED',
        message:
          'You already have a subscription. Change it from your account settings.',
      })
    }),
  },
  plugins: [
    tanstackStartCookies(),
    ...(billing
      ? [
          stripe({
            stripeClient: billing.client,
            stripeWebhookSecret: billing.webhookSecret,
            subscription: {
              enabled: true,
              plans: billing.plans,
              getCheckoutSessionParams: () => ({
                params: managedPaymentsParams(),
              }),
            },
          }),
        ]
      : []),
  ],
})
