import { beforeAll, describe, expect, it } from 'vitest'
import Stripe from 'stripe'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { brewingDeviceTypes, subscription, user } from '../db/schema'
import { callerFor, createCoffeeFor, seedUsers, uniqFor } from '../../test/trpc'
import { auth } from './auth'
import { ESPRESSO_DEVICE_TYPE } from './espresso'

// The purchase, from the only side of it that is the source of truth. Stripe
// tells us a Subscription exists by posting an event; the browser coming back
// from checkout is a convenience the buyer may never grant us. So these tests
// hand a signed request straight to the auth handler and then read the buyer's
// Plan and their history back through the API, with no server, no Stripe key
// and no network — the signature is real, produced with the same secret the
// handler verifies against.
const BUYER = 'stripe-webhook-buyer'
const asBuyer = callerFor(BUYER)
const uniq = uniqFor(BUYER)
const createCoffee = createCoffeeFor(asBuyer, uniq)

const CUSTOMER_ID = 'cus_fixtureBuyer'
const SUBSCRIPTION_ID = 'sub_fixtureBuyer'
const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'

const createdTypeIds: Array<string> = []
async function findOrCreateDeviceType(name: string): Promise<string> {
  const existing = await db
    .select()
    .from(brewingDeviceTypes)
    .where(eq(brewingDeviceTypes.name, name))
  if (existing[0]) return existing[0].id
  const [row] = await db.insert(brewingDeviceTypes).values({ name }).returning()
  createdTypeIds.push(row.id)
  return row.id
}

seedUsers([BUYER], async () => {
  if (createdTypeIds.length) {
    await db
      .delete(brewingDeviceTypes)
      .where(inArray(brewingDeviceTypes.id, createdTypeIds))
  }
})

// Six Coffees, oldest brewed first, so the first one has fallen off a Free
// Shelf and its shot is Sealed before anything is bought.
const shots: Array<string> = []

beforeAll(async () => {
  // Checkout is what attaches the customer to the user; the webhook only ever
  // finds them by it.
  await db
    .update(user)
    .set({ stripeCustomerId: CUSTOMER_ID })
    .where(eq(user.id, BUYER))

  const typeId = await findOrCreateDeviceType(ESPRESSO_DEVICE_TYPE)
  const device = await asBuyer.brewingDevice.create({
    name: uniq('Linea Mini'),
    brand: 'La Marzocco',
    typeId,
  })
  const grinder = await asBuyer.grinder.create({
    name: uniq('Niche Zero'),
    brand: 'Niche',
  })
  const roaster = await asBuyer.roaster.create({ name: uniq('Sey') })

  for (let i = 0; i < 6; i++) {
    const coffee = await createCoffee(uniq(`Coffee ${i}`), {
      roasterId: roaster.id,
    })
    const shot = await asBuyer.espressoShot.create({
      coffeeId: coffee.id,
      grinderId: grinder.id,
      brewingDeviceId: device.id,
      dose: '18',
      yield: '36',
      time: 28,
      grindSetting: '1.5',
    })
    shots.push(shot.id)
  }
})

// What Stripe posts when a Managed Payments Checkout Session completes: the
// Subscription it created. The Session's own event is not what we react to —
// reading it back needs a call to Stripe, and this has everything already.
const subscriptionCreated = {
  id: 'evt_fixtureSubscriptionCreated',
  object: 'event',
  api_version: '2025-03-31.basil',
  created: 1767225600,
  livemode: false,
  pending_webhooks: 0,
  request: { id: null, idempotency_key: null },
  type: 'customer.subscription.created',
  data: {
    object: {
      id: SUBSCRIPTION_ID,
      object: 'subscription',
      customer: CUSTOMER_ID,
      status: 'active',
      metadata: {},
      trial_start: null,
      trial_end: null,
      items: {
        object: 'list',
        data: [
          {
            id: 'si_fixture',
            object: 'subscription_item',
            quantity: 1,
            current_period_start: 1767225600,
            current_period_end: 1769904000,
            price: {
              id: process.env.STRIPE_PRICE_PRO_MONTHLY,
              object: 'price',
              recurring: { interval: 'month' },
            },
          },
        ],
      },
    },
  },
}

const deliver = async (event: unknown, signedWith?: string) => {
  const payload = JSON.stringify(event)
  return auth.handler(
    new Request(`${baseURL}/api/auth/stripe/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': Stripe.webhooks.generateTestHeaderString({
          payload,
          secret: signedWith ?? (process.env.STRIPE_WEBHOOK_SECRET as string),
        }),
      },
      body: payload,
    }),
  )
}

const planOf = async () => (await asBuyer.plan.current()).plan
// Redelivery has to leave one Subscription, not two identical ones — the Plan
// alone would read the same either way.
const subscriptionRowCount = async () =>
  (
    await db
      .select({ id: subscription.id })
      .from(subscription)
      .where(eq(subscription.referenceId, BUYER))
  ).length
const sealedShotIds = async () =>
  (await asBuyer.espressoShot.getAll())
    .filter((shot) => shot.sealed)
    .map((shot) => shot.id)

describe('the Stripe webhook', () => {
  it('leaves the buyer on Free, with a Sealed past, before anything is bought', async () => {
    expect(await planOf()).toBe('free')
    expect(await sealedShotIds()).toEqual([shots[0]])
  })

  it('rejects an event signed with the wrong secret, and changes nothing', async () => {
    const response = await deliver(subscriptionCreated, 'whsec_someoneElse')

    expect(response.ok).toBe(false)
    expect(await planOf()).toBe('free')
  })

  it('rejects an event carrying no signature, and changes nothing', async () => {
    const payload = JSON.stringify(subscriptionCreated)
    const response = await auth.handler(
      new Request(`${baseURL}/api/auth/stripe/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
      }),
    )

    expect(response.ok).toBe(false)
    expect(await planOf()).toBe('free')
  })

  it('puts the buyer on Pro without the browser ever returning from Stripe', async () => {
    const response = await deliver(subscriptionCreated)

    expect(response.ok).toBe(true)
    expect(await planOf()).toBe('pro')
  })

  it('reopens everything Sealed while the buyer was on Free', async () => {
    const all = await asBuyer.espressoShot.getAll()

    expect(all.every((shot) => shot.sealed === false)).toBe(true)
    expect(all.every((shot) => shot.dose === '18')).toBe(true)
  })

  it('changes nothing when Stripe delivers the same event again', async () => {
    const response = await deliver(subscriptionCreated)

    expect(response.ok).toBe(true)
    expect(await planOf()).toBe('pro')
    expect(await subscriptionRowCount()).toBe(1)
  })
})
