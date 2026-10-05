import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { countries, pendingPersonErasure, session, user, verification } from '../db/schema'
import { ESPRESSO_DEVICE_TYPE } from '../lib/espresso'
import { setPersonErasure } from '../lib/erase-person'
import { setErrorCapture } from '../lib/report-error'
import {
  purgeExpiredDeletedAccounts,
  restoreAccount,
} from '../lib/delete-account'
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
const DAY_MS = 24 * 60 * 60 * 1000

let ownedCoffeeId: string
let ownedShotId: string
let ownedGrinderId: string
let otherCoffeeId: string
let sharedCountryId: string
let ownVerificationId: string
let otherVerificationId: string
let sessionToken: string

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

  sessionToken = `tok-${USER}`
  await db.insert(session).values({
    id: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 60_000),
    token: sessionToken,
    userId: USER,
    updatedAt: new Date(),
  })
})

afterEach(() => {
  mocks.cancelBilledSubscriptions.mockReset()
  mocks.cancelBilledSubscriptions.mockResolvedValue(undefined)
  setPersonErasure(null)
  setErrorCapture(null)
})

async function insertUser(
  id: string,
  extras: Partial<typeof user.$inferInsert> = {},
) {
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    ...extras,
  })
}

describe('account.delete', () => {
  it('is refused without a session', async () => {
    await expect(anonCaller.account.delete()).rejects.toThrow(/unauthorized/i)
  })

  it('does not delete when Stripe cannot cancel a live Subscription', async () => {
    const billed = 'delete-account-billed'
    await insertUser(billed, { stripeCustomerId: 'cus_stillBilled' })
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

      const row = await db.query.user.findFirst({ where: { id: billed } })
      expect(row).toBeTruthy()
      expect(row?.deletedAt).toBeNull()
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

  it('cancels at Stripe, marks the account deleted, keeps the library, and ends sessions', async () => {
    const erase = vi.fn().mockResolvedValue(undefined)
    setPersonErasure(erase)

    await asUser.account.delete()

    expect(mocks.cancelBilledSubscriptions).toHaveBeenCalledWith(CUSTOMER_ID)
    expect(erase).not.toHaveBeenCalled()

    const row = await db.query.user.findFirst({ where: { id: USER } })
    expect(row?.deletedAt).toBeTruthy()
    expect(
      await db.query.coffees.findFirst({ where: { id: ownedCoffeeId } }),
    ).toBeTruthy()
    expect(
      await db.query.espressoShots.findFirst({ where: { id: ownedShotId } }),
    ).toBeTruthy()
    expect(
      await db.query.grinders.findFirst({ where: { id: ownedGrinderId } }),
    ).toBeTruthy()
    expect(
      await db.query.planGrants.findFirst({ where: { userId: USER } }),
    ).toBeTruthy()
    expect(
      await db.query.planInterests.findFirst({ where: { userId: USER } }),
    ).toBeTruthy()
    expect(
      await db
        .select()
        .from(verification)
        .where(eq(verification.id, ownVerificationId))
        .then((rows) => rows[0]),
    ).toBeTruthy()
    expect(
      await db.query.session.findFirst({ where: { token: sessionToken } }),
    ).toBeUndefined()

    expect(await db.query.user.findFirst({ where: { id: OTHER } })).toBeTruthy()
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

  it('refuses live procedures while the account is pending deletion', async () => {
    const blocked = 'delete-account-blocked'
    await insertUser(blocked)
    await db
      .update(user)
      .set({ deletedAt: new Date() })
      .where(eq(user.id, blocked))
    const asBlocked = callerFor(blocked)

    try {
      await expect(asBlocked.coffee.getAll()).rejects.toThrow(
        /deleted and can be restored/i,
      )
    } finally {
      await db.delete(user).where(eq(user.id, blocked))
    }
  })

  it('restores the account without calling Stripe', async () => {
    const restored = 'delete-account-restore'
    await insertUser(restored, { stripeCustomerId: 'cus_restored' })
    await db
      .update(user)
      .set({ deletedAt: new Date() })
      .where(eq(user.id, restored))
    const asRestored = callerFor(restored)

    try {
      await asRestored.account.restore()

      expect(mocks.cancelBilledSubscriptions).not.toHaveBeenCalled()
      const row = await db.query.user.findFirst({ where: { id: restored } })
      expect(row?.deletedAt).toBeNull()
      await expect(asRestored.coffee.getAll()).resolves.toEqual([])
    } finally {
      await db.delete(user).where(eq(user.id, restored))
    }
  })

  it('does not restore after the window ends', async () => {
    const tooLate = 'delete-account-too-late'
    await insertUser(tooLate)
    await db
      .update(user)
      .set({ deletedAt: new Date('2025-01-01T00:00:00.000Z') })
      .where(eq(user.id, tooLate))
    const asTooLate = callerFor(tooLate)

    try {
      await expect(asTooLate.account.restore()).rejects.toThrow(
        /no longer be restored/i,
      )
      expect(
        (await db.query.user.findFirst({ where: { id: tooLate } }))
          ?.deletedAt,
      ).toBeTruthy()
    } finally {
      await db.delete(user).where(eq(user.id, tooLate))
    }
  })

  it('does not ask Stripe when the account was never a customer', async () => {
    const free = 'delete-account-no-customer'
    await insertUser(free)
    const asFree = callerFor(free)

    try {
      await asFree.account.delete()

      expect(mocks.cancelBilledSubscriptions).not.toHaveBeenCalled()
      const row = await db.query.user.findFirst({ where: { id: free } })
      expect(row?.deletedAt).toBeTruthy()
    } finally {
      await db.delete(user).where(eq(user.id, free))
    }
  })
})

describe('purge of deleted accounts', () => {
  it('erases rows, verification rows, and the PostHog person after 30 days', async () => {
    const stale = 'delete-account-stale'
    await insertUser(stale)
    await db.insert(verification).values({
      id: crypto.randomUUID(),
      identifier: `${stale}@example.com`,
      value: 'stale-token',
      expiresAt: new Date(Date.now() + 60_000),
    })
    const deletedAt = new Date('2026-01-01T00:00:00.000Z')
    await db.update(user).set({ deletedAt }).where(eq(user.id, stale))
    const erase = vi.fn().mockResolvedValue(undefined)
    setPersonErasure(erase)

    try {
      const result = await purgeExpiredDeletedAccounts(
        new Date('2026-01-31T00:00:00.000Z'),
      )

      expect(result).toEqual({ purged: 1 })
      expect(erase).toHaveBeenCalledWith(stale)
      expect(
        await db.query.user.findFirst({ where: { id: stale } }),
      ).toBeUndefined()
      expect(
        await db
          .select()
          .from(verification)
          .where(eq(verification.identifier, `${stale}@example.com`))
          .then((rows) => rows[0]),
      ).toBeUndefined()
    } finally {
      await db.delete(user).where(eq(user.id, stale))
    }
  })

  it('leaves an account inside the window', async () => {
    const recent = 'delete-account-recent'
    await insertUser(recent)
    await db
      .update(user)
      .set({ deletedAt: new Date('2026-01-10T00:00:00.000Z') })
      .where(eq(user.id, recent))
    const erase = vi.fn()
    setPersonErasure(erase)

    try {
      const result = await purgeExpiredDeletedAccounts(
        new Date('2026-01-31T00:00:00.000Z'),
      )

      expect(result).toEqual({ purged: 0 })
      expect(erase).not.toHaveBeenCalled()
      expect(
        await db.query.user.findFirst({ where: { id: recent } }),
      ).toBeTruthy()
    } finally {
      await db.delete(user).where(eq(user.id, recent))
    }
  })

  it('does not erase an account that has been restored', async () => {
    const restored = 'delete-account-restored-then-purge'
    await insertUser(restored)
    await db
      .update(user)
      .set({ deletedAt: new Date('2026-01-01T00:00:00.000Z') })
      .where(eq(user.id, restored))
    const erase = vi.fn()
    setPersonErasure(erase)

    try {
      await restoreAccount(restored, new Date('2026-01-15T00:00:00.000Z'))
      const result = await purgeExpiredDeletedAccounts(
        new Date('2026-01-31T00:00:00.000Z'),
      )
      expect(result).toEqual({ purged: 0 })
      expect(erase).not.toHaveBeenCalled()
      expect(
        (await db.query.user.findFirst({ where: { id: restored } }))
          ?.deletedAt,
      ).toBeNull()
    } finally {
      await db.delete(user).where(eq(user.id, restored))
    }
  })

  it('is a no-op the second time', async () => {
    const stale = 'delete-account-idempotent'
    await insertUser(stale)
    await db.insert(verification).values({
      id: crypto.randomUUID(),
      identifier: `${stale}@example.com`,
      value: 'idempotent-token',
      expiresAt: new Date(Date.now() + 60_000),
    })
    await db
      .update(user)
      .set({ deletedAt: new Date('2025-12-01T00:00:00.000Z') })
      .where(eq(user.id, stale))
    const erase = vi.fn().mockResolvedValue(undefined)
    setPersonErasure(erase)

    try {
      const now = new Date('2026-01-31T00:00:00.000Z')
      await expect(purgeExpiredDeletedAccounts(now)).resolves.toEqual({
        purged: 1,
      })
      await expect(purgeExpiredDeletedAccounts(now)).resolves.toEqual({
        purged: 0,
      })
      expect(erase).toHaveBeenCalledTimes(1)
    } finally {
      await db.delete(user).where(eq(user.id, stale))
    }
  })

  it('still removes the rows when PostHog erasure fails', async () => {
    const leftover = 'delete-account-erase-fail'
    await insertUser(leftover)
    await db
      .update(user)
      .set({ deletedAt: new Date(Date.now() - 31 * DAY_MS) })
      .where(eq(user.id, leftover))
    const capture = vi.fn()
    setErrorCapture(capture)
    setPersonErasure(vi.fn().mockRejectedValue(new Error('posthog down')))

    try {
      await purgeExpiredDeletedAccounts()

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
      expect(
        await db
          .select()
          .from(pendingPersonErasure)
          .where(eq(pendingPersonErasure.accountId, leftover)),
      ).toHaveLength(1)
    } finally {
      await db
        .delete(pendingPersonErasure)
        .where(eq(pendingPersonErasure.accountId, leftover))
      await db.delete(user).where(eq(user.id, leftover))
    }
  })

  it('retries a person delete that failed last time', async () => {
    const leftover = 'delete-account-erase-retry'
    await db
      .insert(pendingPersonErasure)
      .values({ accountId: leftover })
    const erase = vi.fn().mockResolvedValue(undefined)
    setPersonErasure(erase)

    try {
      await expect(purgeExpiredDeletedAccounts()).resolves.toEqual({
        purged: 0,
      })
      expect(erase).toHaveBeenCalledWith(leftover)
      expect(
        await db
          .select()
          .from(pendingPersonErasure)
          .where(eq(pendingPersonErasure.accountId, leftover)),
      ).toEqual([])
    } finally {
      await db
        .delete(pendingPersonErasure)
        .where(eq(pendingPersonErasure.accountId, leftover))
    }
  })
})
