import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { stripe } from '@better-auth/stripe'
import { db } from '../db'
import * as schema from '../db/auth-schema'
import { billingConfig, managedPaymentsParams } from './billing'

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
