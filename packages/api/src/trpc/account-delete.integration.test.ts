import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { countries, user, verification } from '../db/schema'
import { ESPRESSO_DEVICE_TYPE } from '../lib/espresso'
import { setPersonErasure } from '../lib/erase-person'
import { setErrorCapture } from '../lib/report-error'
import {
  anonCaller,
  callerFor,
  createCoffeeFor,
  deviceTypes,
  grantPlan,
  seedUsers,
  uniqFor,
} from '../../test/trpc'
import type * as Billing from '../lib/billing'

const mocks = vi.hoisted(() => ({
  cancelBilledSubscriptions: vi.fn(),
}))

vi.mock('../lib/billing', async (importOriginal) => {
  const actual = await importOriginal<typeof Billing>()
  return {
    ...actual,
    cancelBilledSubscriptions: mocks.cancelBilledSubscriptions,
  }
})

const USER = 'delete-account-user'
const OTHER = 'delete-account-other'
const asUser = callerFor(USER)
const asOther = callerFor(OTHER)
const uniq = uniqFor(USER)
const uniqOther = uniqFor(OTHER)
const createCoffee = createCoffeeFor(asUser, uniq)
const types = deviceTypes()

seedUsers([USER, OTHER], async () => {
  await types.cleanup()
  if (sharedCountryId) {
    await db.delete(countries).where(eq(countries.id, sharedCountryId))
  }
})

const CUSTOMER_ID = 'cus_deleteAccount'
const SHARED_NAME = `Shared land ${USER}`

let ownedCoffeeId: string
let ownedShotId: string
let ownedGrinderId: string
let otherCoffeeId: string
let sharedCountryId: string
let ownVerificationId: string
let otherVerificationId: string

beforeAll(async () => {
  mocks.cancelBilledSubscriptions.mockResolvedValue(undefined)

  await db
    .update(user)
    .set({ stripeCustomerId: CUSTOMER_ID })
    .where(eq(user.id, USER))

  const [shared] = await db
    .insert(countries)
    .values({ name: SHARED_NAME })
    .returning()
  sharedCountryId = shared.id

  await grantPlan(USER, 'pro', { reason: 'delete fixture' })

  const typeId = await types.findOrCreate(ESPRESSO_DEVICE_TYPE)
  const device = await asUser.brewingDevice.create({
    name: uniq('Linea Mini'),
    brand: 'La Marzocco',
    typeId,
  })
  const grinder = await asUser.grinder.create({
    name: uniq('Niche Zero'),
    brand: 'Niche',
  })
  ownedGrinderId = grinder.id
  const roaster = await asUser.roaster.create({ name: uniq('Sey') })
  const coffee = await createCoffee(uniq('Ethiopia Guji'), {
    roasterId: roaster.id,
    origins: [{ countryId: shared.id }],
  })
  ownedCoffeeId = coffee.id
  ownedShotId = (
    await asUser.espressoShot.create({
      coffeeId: coffee.id,
      grinderId: grinder.id,
      brewingDeviceId: device.id,
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: '21',
    })
  ).id

  await asUser.planInterest.register({ planId: 'proPlus' })

  const otherCoffee = await createCoffeeFor(asOther, uniqOther)(
    uniqOther('Other coffee'),
  )
  otherCoffeeId = otherCoffee.id

  const [ownVerification] = await db
    .insert(verification)
    .values({
      id: crypto.randomUUID(),
      identifier: `${USER}@example.com`,
      value: 'own-token',
      expiresAt: new Date(Date.now() + 60_000),
    })
    .returning()
  ownVerificationId = ownVerification.id
  const [otherVerification] = await db
    .insert(verification)
    .values({
      id: crypto.randomUUID(),
      identifier: `${OTHER}@example.com`,
      value: 'other-token',
      expiresAt: new Date(Date.now() + 60_000),
    })
    .returning()
  otherVerificationId = otherVerification.id
})

afterEach(() => {
  mocks.cancelBilledSubscriptions.mockReset()
  mocks.cancelBilledSubscriptions.mockResolvedValue(undefined)
  setPersonErasure(null)
  setErrorCapture(null)
})

describe('account.delete', () => {
  it('is refused without a session', async () => {
    await expect(anonCaller.account.delete()).rejects.toThrow(/unauthorized/i)
  })

  it('does not delete when Stripe cannot cancel a live Subscription', async () => {
    const billed = 'delete-account-billed'
    await db.insert(user).values({
      id: billed,
      name: billed,
      email: `${billed}@example.com`,
      stripeCustomerId: 'cus_stillBilled',
    })
    const asBilled = callerFor(billed)
    mocks.cancelBilledSubscriptions.mockRejectedValueOnce(
      new Error('stripe down'),
    )
    const capture = vi.fn()
    setErrorCapture(capture)

    try {
      await expect(asBilled.account.delete()).rejects.toThrow(
        /could not cancel your Subscription/i,
      )

      expect(
        await db.query.user.findFirst({ where: { id: billed } }),
      ).toBeTruthy()
      expect(capture).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: {
            area: 'account',
            operation: 'cancelBilledSubscriptions',
          },
          user: { id: billed },
        }),
      )
    } finally {
      await db.delete(user).where(eq(user.id, billed))
    }
  })

  it('cancels at Stripe, then removes what the user owns and leaves the rest', async () => {
    const erase = vi.fn().mockResolvedValue(undefined)
    setPersonErasure(erase)

    await asUser.account.delete()

    expect(mocks.cancelBilledSubscriptions).toHaveBeenCalledWith(CUSTOMER_ID)
    expect(erase).toHaveBeenCalledWith(USER)

    expect(await db.query.user.findFirst({ where: { id: USER } })).toBeUndefined()
    expect(
      await db.query.coffees.findFirst({ where: { id: ownedCoffeeId } }),
    ).toBeUndefined()
    expect(
      await db.query.espressoShots.findFirst({ where: { id: ownedShotId } }),
    ).toBeUndefined()
    expect(
      await db.query.grinders.findFirst({ where: { id: ownedGrinderId } }),
    ).toBeUndefined()
    expect(
      await db.query.planGrants.findFirst({ where: { userId: USER } }),
    ).toBeUndefined()
    expect(
      await db.query.planInterests.findFirst({ where: { userId: USER } }),
    ).toBeUndefined()
    expect(
      await db
        .select()
        .from(verification)
        .where(eq(verification.id, ownVerificationId))
        .then((rows) => rows[0]),
    ).toBeUndefined()

    expect(
      await db.query.user.findFirst({ where: { id: OTHER } }),
    ).toBeTruthy()
    expect(
      await db.query.coffees.findFirst({ where: { id: otherCoffeeId } }),
    ).toBeTruthy()
    expect(
      await db.query.countries.findFirst({ where: { id: sharedCountryId } }),
    ).toBeTruthy()
    expect(
      await db
        .select()
        .from(verification)
        .where(eq(verification.id, otherVerificationId))
        .then((rows) => rows[0]),
    ).toBeTruthy()
  })

  it('still deletes the account when PostHog erasure fails', async () => {
    const leftover = 'delete-account-erase-fail'
    await db.insert(user).values({
      id: leftover,
      name: leftover,
      email: `${leftover}@example.com`,
    })
    const asLeftover = callerFor(leftover)
    const capture = vi.fn()
    setErrorCapture(capture)
    setPersonErasure(vi.fn().mockRejectedValue(new Error('posthog down')))

    try {
      await asLeftover.account.delete()

      expect(
        await db.query.user.findFirst({ where: { id: leftover } }),
      ).toBeUndefined()
      expect(capture).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: { area: 'account', operation: 'erasePerson' },
          user: { id: leftover },
        }),
      )
    } finally {
      await db.delete(user).where(eq(user.id, leftover))
    }
  })

  it('does not ask Stripe when the account was never a customer', async () => {
    const free = 'delete-account-no-customer'
    await db.insert(user).values({
      id: free,
      name: free,
      email: `${free}@example.com`,
    })
    const asFree = callerFor(free)

    try {
      await asFree.account.delete()

      expect(mocks.cancelBilledSubscriptions).not.toHaveBeenCalled()
      expect(
        await db.query.user.findFirst({ where: { id: free } }),
      ).toBeUndefined()
    } finally {
      await db.delete(user).where(eq(user.id, free))
    }
  })
})
