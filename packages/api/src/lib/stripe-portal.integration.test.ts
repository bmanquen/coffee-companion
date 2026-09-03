import { afterAll, describe, expect, it } from 'vitest'
import { db } from '../db'
import { auth } from './auth'

// The portal session is created for whoever the app session says is asking.
// Without one there is nobody to open it for, so the request is turned away
// before Stripe hears of it.
const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'

const openPortal = () =>
  auth.handler(
    new Request(`${baseURL}/api/auth/subscription/billing-portal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseURL },
      body: JSON.stringify({ returnUrl: '/account' }),
    }),
  )

// No seedUsers here, so no teardown to close the pool the session lookup opens.
afterAll(async () => {
  await db.$client.end()
})

describe('opening the billing portal', () => {
  it('is refused to a caller with no session', async () => {
    const response = await openPortal()

    expect(response.status).toBe(401)
  })
})
