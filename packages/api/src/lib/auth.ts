import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from 'better-auth/api'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { stripe } from '@better-auth/stripe'
import { expo } from '@better-auth/expo'
import { db } from '../db'
import * as schema from '../db/auth-schema'
import { releaseUnverifiedEmailFromVerifiedSocial } from './account-email-hold'
import { accountOptions } from './account-linking'
import { appleNativeSignIn } from './apple-native-plugin'
import { trustedAuthOrigins } from './auth-origins'
import {
  billingConfig,
  hasLiveSubscription,
  managedPaymentsParams,
} from './billing'

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'

const googleClientIds = [
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,
].filter((id): id is string => Boolean(id))

// Resolved here, at import, so a deployment missing a price fails on the way up
// rather than under the first customer to press Subscribe. Null switches
// billing off entirely, which is how a fresh clone and CI run.
const billing = billingConfig()

export const auth = betterAuth({
  baseURL,
  trustedOrigins: trustedAuthOrigins(baseURL),
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  account: accountOptions,
  user: {
    additionalFields: {
      deletedAt: {
        type: 'date',
        required: false,
        input: false,
      },
    },
  },
  socialProviders: {
    google: {
      clientId:
        googleClientIds.length <= 1
          ? (googleClientIds[0] ?? (process.env.GOOGLE_CLIENT_ID as string))
          : googleClientIds,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  hooks: {
    // A user holds one Subscription at a time. Changing it is the billing
    // portal's job; Checkout only ever sells the first one.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/sign-in/social') {
        // Release only after the provider verifies the id token. An
        // unverified decode would let a forged JWT steal an unused address.
        await releaseUnverifiedEmailFromVerifiedSocial(
          ctx.body,
          ctx.context.socialProviders,
        )
        return
      }
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
    expo(),
    appleNativeSignIn(),
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
