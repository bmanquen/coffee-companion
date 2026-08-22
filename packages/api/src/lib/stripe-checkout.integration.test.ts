import { afterAll, describe, expect, it } from 'vitest'
import { db } from '../db'
import { auth } from './auth'

// The other side of the purchase: opening Checkout at all. Under Managed
// Payments the buyer deals with Link, and the email they pay under can differ
// from the one they signed in with, so the session is the only thing tying a
// purchase to an account. A Checkout Session opened without one would create a
// Subscription with no account to attach it to, and no email would find it
// afterwards — which is why this is refused rather than reconciled later.
const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'

const upgrade = () =>
  auth.handler(
    new Request(`${baseURL}/api/auth/subscription/upgrade`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseURL },
      body: JSON.stringify({
        plan: 'pro',
        successUrl: '/dashboard',
        cancelUrl: '/pricing',
      }),
    }),
  )

// No seedUsers here, so no teardown to close the pool the session lookup opens.
afterAll(async () => {
  await db.$client.end()
})

describe('opening Checkout', () => {
  // Unauthorized rather than a failure out of Stripe: the fixture key would not
  // survive a real call, so being turned away before one is made is the whole
  // of the assertion.
  it('is refused to a caller with no session', async () => {
    const response = await upgrade()

    expect(response.status).toBe(401)
  })
})
