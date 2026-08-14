import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { espressoShots } from '../db/schema'
import { ESPRESSO_DEVICE_TYPE } from '../lib/espresso'
import {
  callerFor,
  deviceTypes,
  grantPlan,
  scheduleCancellation,
  seedUsers,
  setSubscriptionStatus,
  subscribePlan,
  uniqFor,
} from '../../test/trpc'

// How a paid Plan ends (ADR-0007), observed where it is felt: the Shelf, and
// what falls off it. Every ending reaches the app as one Subscription status
// changing, with Stripe deciding when — so these tests drive that column, and
// fail if the binding between an ending and a status moves.

const CANCELLED = 'lapse-cancelled'
const DECLINED = 'lapse-declined'
const LINK_DELETED = 'lapse-link-deleted'
const GRANTED = 'lapse-granted'

const types = deviceTypes()

seedUsers([CANCELLED, DECLINED, LINK_DELETED, GRANTED], types.cleanup)

// A subscriber with six Coffees, one Brew each, oldest first. Pro holds the
// whole library, so all six read until the Subscription stops conferring it —
// at which point the Shelf is five and the oldest is what falls off.
async function subscriberWithSixCoffees(userId: string) {
  const as = callerFor(userId)
  const uniq = uniqFor(userId)

  await subscribePlan(userId, 'pro')

  const typeId = await types.findOrCreate(ESPRESSO_DEVICE_TYPE)
  const device = await as.brewingDevice.create({
    name: uniq('Linea Mini'),
    brand: 'La Marzocco',
    typeId,
  })
  const grinder = await as.grinder.create({ name: uniq('Niche'), brand: 'Niche' })
  const roaster = await as.roaster.create({ name: uniq('Sey') })

  const logShot = (coffeeId: string) =>
    as.espressoShot.create({
      coffeeId,
      grinderId: grinder.id,
      brewingDeviceId: device.id,
      dose: '18',
      yield: '36',
      time: 28,
    })

  const shotIds: Array<string> = []
  const coffeeIds: Array<string> = []
  for (let i = 0; i < 6; i++) {
    const coffee = await as.coffee.create({
      name: uniq(`Coffee ${i}`),
      roasterId: roaster.id,
    })
    coffeeIds.push(coffee.id)
    shotIds.push((await logShot(coffee.id)).id)
  }

  return {
    as,
    // The Brew on the Coffee that falls off a five-Coffee Shelf.
    oldest: shotIds[0],
    // Brewing the Coffee at the top of the Shelf reorders nothing, so it is the
    // way to trigger Sealing's write without rescuing anything from below.
    brewTheNewest: () => logShot(coffeeIds[5]),
    sealed: async (shotId: string) => {
      const all = await as.espressoShot.getAll()
      const found = all.find((shot) => shot.id === shotId)
      if (!found) throw new Error(`Shot ${shotId} missing from the feed`)
      return found.sealed
    },
    // Sealing's only write, so comparing it before and after is how "nothing
    // changed" is checked without trusting the read path to say so.
    stamps: () =>
      db
        .select({ id: espressoShots.id, sealedAt: espressoShots.sealedAt })
        .from(espressoShots)
        .where(eq(espressoShots.userId, userId))
        .orderBy(espressoShots.id),
  }
}

type Subscriber = Awaited<ReturnType<typeof subscriberWithSixCoffees>>

describe('cancelling', () => {
  let sub: Subscriber

  beforeAll(async () => {
    sub = await subscriberWithSixCoffees(CANCELLED)
    await scheduleCancellation(CANCELLED)
  })

  it('leaves history readable until the paid period ends', async () => {
    // Stripe keeps the Subscription active for the period already paid for, so
    // asking to cancel Seals nothing on its own.
    expect((await sub.as.plan.current()).plan).toBe('pro')
    expect(await sub.sealed(sub.oldest)).toBe(false)
  })

  it('Seals what falls off once the period is over', async () => {
    await setSubscriptionStatus(CANCELLED, 'canceled')

    expect((await sub.as.plan.current()).plan).toBe('free')
    expect(await sub.sealed(sub.oldest)).toBe(true)
  })

  it('changes nothing when the same ending is delivered twice', async () => {
    // Bracket the redelivery with writes. Stamping only ever happens on write,
    // so a redelivery followed by a read proves nothing — it would hold even if
    // Sealing re-stamped every Brew it saw.
    await sub.brewTheNewest()
    const before = await sub.stamps()
    expect(before.some((shot) => shot.sealedAt !== null)).toBe(true)

    await setSubscriptionStatus(CANCELLED, 'canceled')
    await sub.brewTheNewest()

    const alreadyThere = new Set(before.map((shot) => shot.id))
    expect(
      (await sub.stamps()).filter((shot) => alreadyThere.has(shot.id)),
    ).toEqual(before)
  })
})

describe('a declined renewal', () => {
  let sub: Subscriber

  beforeAll(async () => {
    sub = await subscriberWithSixCoffees(DECLINED)
  })

  it('does not Seal — the Plan stays paid while Stripe retries', async () => {
    await setSubscriptionStatus(DECLINED, 'past_due')

    expect((await sub.as.plan.current()).plan).toBe('pro')
    expect(await sub.sealed(sub.oldest)).toBe(false)
  })

  it('tells the user, while the card is still fixable', async () => {
    expect((await sub.as.plan.current()).renewalFailing).toBe(true)
  })

  it('leaves the history exactly as it was when the payment recovers', async () => {
    const before = await sub.stamps()

    await setSubscriptionStatus(DECLINED, 'active')

    expect(await sub.as.plan.current()).toMatchObject({
      plan: 'pro',
      renewalFailing: false,
    })
    expect(await sub.sealed(sub.oldest)).toBe(false)
    // No stamp landed while it was failing, so there is nothing to flicker.
    expect(await sub.stamps()).toEqual(before)
  })

  it('shrinks the Shelf and Seals what falls off once the retries are exhausted', async () => {
    await setSubscriptionStatus(DECLINED, 'past_due')
    expect(await sub.sealed(sub.oldest)).toBe(false)

    // Stripe gives up and cancels the Subscription itself.
    await setSubscriptionStatus(DECLINED, 'canceled')

    expect((await sub.as.plan.current()).plan).toBe('free')
    expect(await sub.sealed(sub.oldest)).toBe(true)
  })
})

describe('a deleted Link account', () => {
  it('is handled by the cancellation rule, with no branch of its own', async () => {
    const sub = await subscriberWithSixCoffees(LINK_DELETED)
    expect(await sub.sealed(sub.oldest)).toBe(false)

    // Stripe cancels the Subscriptions it sold that account, and the app sees
    // the same status it sees for any other cancellation.
    await setSubscriptionStatus(LINK_DELETED, 'canceled')

    expect((await sub.as.plan.current()).plan).toBe('free')
    expect(await sub.sealed(sub.oldest)).toBe(true)
  })
})

// Sources of a Plan do not subtract from one another: a comp is not withdrawn
// because the card behind a Subscription stopped working.
describe('a Grant more generous than the Subscription', () => {
  let sub: Subscriber

  beforeAll(async () => {
    sub = await subscriberWithSixCoffees(GRANTED)
    await grantPlan(GRANTED, 'proPlus')
  })

  it('survives a declined renewal', async () => {
    await setSubscriptionStatus(GRANTED, 'past_due')

    expect((await sub.as.plan.current()).plan).toBe('proPlus')
    expect(await sub.sealed(sub.oldest)).toBe(false)
  })

  it('survives the cancellation that ends the Subscription', async () => {
    const before = await sub.stamps()

    await setSubscriptionStatus(GRANTED, 'canceled')

    expect((await sub.as.plan.current()).plan).toBe('proPlus')
    expect(await sub.sealed(sub.oldest)).toBe(false)
    expect(await sub.stamps()).toEqual(before)
  })
})
