import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { exportPKCS8, generateKeyPair } from 'jose'
import { db } from '../db'
import {
  account,
  countries,
  pendingPersonErasure,
  session,
  user,
  verification,
} from '../db/schema'
import {
  APPLE_PROVIDER_ID,
  APPLE_REFRESH_TOKEN_HINT,
  APPLE_REVOKE_URL,
} from '../lib/apple'
import { ESPRESSO_DEVICE_TYPE } from '../lib/espresso'
import { setPersonErasure } from '../lib/erase-person'
import {
  OAUTH_TOKEN_DECRYPT_FAILED,
  OAUTH_TOKEN_ENVELOPE_PREFIX,
  encryptStoredOAuthToken,
} from '../lib/oauth-token'
import { setErrorCapture } from '../lib/report-error'
import {
  purgeExpiredDeletedAccounts,
  restoreAccount,
} from '../lib/delete-account'
import {
  anonCaller,
  callerFor,
  captureLogLines,
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
const APPLE_ENV_VARS = [
  'APPLE_BUNDLE_ID',
  'APPLE_TEAM_ID',
  'APPLE_KEY_ID',
  'APPLE_PRIVATE_KEY',
] as const
const APPLE_TEST_BUNDLE_ID = 'dev.offbyonelabs.coffeecompanion'
const APPLE_TEST_TEAM_ID = 'TEAMDEL01'
const APPLE_TEST_KEY_ID = 'DELKEY01'
const ROTATED_BETTER_AUTH_SECRET = 'rotated-better-auth-secret-fixture-32b!!'
const APPLE_REFRESH_TOKEN = 'rt_apple_delete'
const UNDECRYPTABLE_APPLE_ENVELOPE = `${OAUTH_TOKEN_ENVELOPE_PREFIX}1$not-a-ciphertext`
const APPLE_REVOKE_OK_STATUS = 200
const APPLE_REVOKE_REFUSED_STATUS = 400
const APPLE_REFRESH_TOKEN_NOT_REVOKED = 'Apple refresh token was not revoked'
const APPLE_REFRESH_TOKEN_REVOKE_FAILED = 'Apple refresh token revoke failed'
const lines = captureLogLines()

let ownedCoffeeId: string
let ownedShotId: string
let ownedGrinderId: string
let otherCoffeeId: string
let sharedCountryId: string
let ownVerificationId: string
let otherVerificationId: string
let sessionToken: string
let applePrivateKey: string
const savedAppleEnv = Object.fromEntries(
  APPLE_ENV_VARS.map((name) => [name, process.env[name]]),
)

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

  const otherCoffee = await createCoffeeFor(
    asOther,
    uniqOther,
  )(uniqOther('Other coffee'))
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

  const pair = await generateKeyPair('ES256', { extractable: true })
  applePrivateKey = await exportPKCS8(pair.privateKey)
})

afterEach(() => {
  mocks.cancelBilledSubscriptions.mockReset()
  mocks.cancelBilledSubscriptions.mockResolvedValue(undefined)
  setPersonErasure(null)
  setErrorCapture(null)
  vi.unstubAllGlobals()
  for (const name of APPLE_ENV_VARS) {
    if (savedAppleEnv[name] === undefined) delete process.env[name]
    else process.env[name] = savedAppleEnv[name]
  }
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

async function insertAppleAccount(userId: string, refreshToken: string) {
  await db.insert(account).values({
    id: globalThis.crypto.randomUUID(),
    accountId: `apple.${userId}`,
    providerId: APPLE_PROVIDER_ID,
    userId,
    refreshToken,
  })
}

async function encryptUnderRotatedSecret(token: string) {
  const current = process.env.BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_SECRET = ROTATED_BETTER_AUTH_SECRET
  try {
    return await encryptStoredOAuthToken(token)
  } finally {
    if (current === undefined) delete process.env.BETTER_AUTH_SECRET
    else process.env.BETTER_AUTH_SECRET = current
  }
}

function appleRevokeCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(
    ([url]) => String(url) === APPLE_REVOKE_URL,
  )
}

function enableAppleSignIn() {
  process.env.APPLE_BUNDLE_ID = APPLE_TEST_BUNDLE_ID
  process.env.APPLE_TEAM_ID = APPLE_TEST_TEAM_ID
  process.env.APPLE_KEY_ID = APPLE_TEST_KEY_ID
  process.env.APPLE_PRIVATE_KEY = applePrivateKey
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
    await grantPlan(restored, 'pro', { reason: 'restore keeps the grant' })
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
      expect(
        (await db.query.planGrants.findFirst({ where: { userId: restored } }))
          ?.planId,
      ).toBe('pro')
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
        (await db.query.user.findFirst({ where: { id: tooLate } }))?.deletedAt,
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

  it('does not revoke Apple and keeps the stored refresh token', async () => {
    const appleUser = 'delete-account-apple-keeps-token'
    const stored = await encryptStoredOAuthToken(APPLE_REFRESH_TOKEN)
    await insertUser(appleUser)
    await insertAppleAccount(appleUser, stored)
    enableAppleSignIn()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const asApple = callerFor(appleUser)

    try {
      await asApple.account.delete()

      const row = await db.query.user.findFirst({ where: { id: appleUser } })
      expect(row?.deletedAt).toBeTruthy()
      expect(appleRevokeCalls(fetchMock)).toHaveLength(0)
      expect(
        (
          await db.query.account.findFirst({
            where: { userId: appleUser, providerId: APPLE_PROVIDER_ID },
          })
        )?.refreshToken,
      ).toBe(stored)
    } finally {
      await db.delete(user).where(eq(user.id, appleUser))
    }
  })
})

describe('purge of deleted accounts', () => {
  it('erases rows, verification rows, and the PostHog person after 30 days', async () => {
    const stale = 'delete-account-stale'
    await insertUser(stale)
    await grantPlan(stale, 'pro', { reason: 'purge removes the grant' })
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
        await db.query.planGrants.findFirst({ where: { userId: stale } }),
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

  it('does not erase an account restored after purge has already selected it', async () => {
    const racing = 'delete-account-restore-during-purge'
    await insertUser(racing)
    await db
      .update(user)
      .set({ deletedAt: new Date('2026-01-01T00:00:00.000Z') })
      .where(eq(user.id, racing))
    const erase = vi.fn()
    setPersonErasure(erase)

    try {
      const result = await purgeExpiredDeletedAccounts(
        new Date('2026-01-31T00:00:00.000Z'),
        () => restoreAccount(racing, new Date('2026-01-15T00:00:00.000Z')),
      )

      expect(result).toEqual({ purged: 0 })
      expect(erase).not.toHaveBeenCalled()
      expect(
        (await db.query.user.findFirst({ where: { id: racing } }))?.deletedAt,
      ).toBeNull()
    } finally {
      await db.delete(user).where(eq(user.id, racing))
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
        (await db.query.user.findFirst({ where: { id: restored } }))?.deletedAt,
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

  it('revokes the Apple refresh token when a deleted account is purged', async () => {
    const stale = 'delete-account-apple-purge-revoke'
    await insertUser(stale)
    await insertAppleAccount(
      stale,
      await encryptStoredOAuthToken(APPLE_REFRESH_TOKEN),
    )
    await db
      .update(user)
      .set({ deletedAt: new Date('2026-01-01T00:00:00.000Z') })
      .where(eq(user.id, stale))
    enableAppleSignIn()
    const fetchMock = vi.fn(
      async () => new Response(null, { status: APPLE_REVOKE_OK_STATUS }),
    )
    vi.stubGlobal('fetch', fetchMock)
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
      const revokeCalls = appleRevokeCalls(fetchMock)
      expect(revokeCalls).toHaveLength(1)
      const body = String(revokeCalls[0]?.[1]?.body)
      expect(body).toContain(`client_id=${APPLE_TEST_BUNDLE_ID}`)
      expect(body).toContain(`token=${APPLE_REFRESH_TOKEN}`)
      expect(body).toContain(
        `token_type_hint=${APPLE_REFRESH_TOKEN_HINT}`,
      )
    } finally {
      await db.delete(user).where(eq(user.id, stale))
    }
  })

  it('does not revoke Apple when a pending account is restored during purge', async () => {
    const racing = 'delete-account-apple-restore-during-purge'
    await insertUser(racing)
    await insertAppleAccount(
      racing,
      await encryptStoredOAuthToken(APPLE_REFRESH_TOKEN),
    )
    await db
      .update(user)
      .set({ deletedAt: new Date('2026-01-01T00:00:00.000Z') })
      .where(eq(user.id, racing))
    enableAppleSignIn()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const erase = vi.fn()
    setPersonErasure(erase)

    try {
      const result = await purgeExpiredDeletedAccounts(
        new Date('2026-01-31T00:00:00.000Z'),
        () => restoreAccount(racing, new Date('2026-01-15T00:00:00.000Z')),
      )

      expect(result).toEqual({ purged: 0 })
      expect(erase).not.toHaveBeenCalled()
      expect(appleRevokeCalls(fetchMock)).toHaveLength(0)
      expect(
        (await db.query.user.findFirst({ where: { id: racing } }))?.deletedAt,
      ).toBeNull()
    } finally {
      await db.delete(user).where(eq(user.id, racing))
    }
  })

  it('still purges when the Apple refresh token cannot be decrypted', async () => {
    const stale = 'delete-account-apple-purge-undecryptable'
    await insertUser(stale)
    const ciphertext = await encryptUnderRotatedSecret(APPLE_REFRESH_TOKEN)
    await insertAppleAccount(stale, ciphertext)
    await db
      .update(user)
      .set({ deletedAt: new Date('2026-01-01T00:00:00.000Z') })
      .where(eq(user.id, stale))
    enableAppleSignIn()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
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
      expect(appleRevokeCalls(fetchMock)).toHaveLength(0)
      expect(
        lines.filter((line) => line.message === APPLE_REFRESH_TOKEN_NOT_REVOKED),
      ).toEqual([
        {
          level: 'warn',
          message: APPLE_REFRESH_TOKEN_NOT_REVOKED,
          fields: {
            userId: stale,
            reason: OAUTH_TOKEN_DECRYPT_FAILED,
          },
        },
      ])
      const logged = JSON.stringify(lines)
      expect(logged).not.toContain(APPLE_REFRESH_TOKEN)
      expect(logged).not.toContain(ciphertext)
    } finally {
      await db.delete(user).where(eq(user.id, stale))
    }
  })

  it('still purges when the stored Apple refresh token is an undecryptable envelope', async () => {
    const stale = 'delete-account-apple-purge-undecryptable-envelope'
    await insertUser(stale)
    await insertAppleAccount(stale, UNDECRYPTABLE_APPLE_ENVELOPE)
    await db
      .update(user)
      .set({ deletedAt: new Date('2026-01-01T00:00:00.000Z') })
      .where(eq(user.id, stale))
    enableAppleSignIn()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
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
      expect(appleRevokeCalls(fetchMock)).toHaveLength(0)
      expect(
        lines.filter((line) => line.message === APPLE_REFRESH_TOKEN_NOT_REVOKED),
      ).toEqual([
        {
          level: 'warn',
          message: APPLE_REFRESH_TOKEN_NOT_REVOKED,
          fields: {
            userId: stale,
            reason: OAUTH_TOKEN_DECRYPT_FAILED,
          },
        },
      ])
      const logged = JSON.stringify(lines)
      expect(logged).not.toContain(UNDECRYPTABLE_APPLE_ENVELOPE)
    } finally {
      await db.delete(user).where(eq(user.id, stale))
    }
  })

  it('still purges when Apple refuses the refresh token revoke', async () => {
    const stale = 'delete-account-apple-purge-revoke-refused'
    await insertUser(stale)
    await insertAppleAccount(
      stale,
      await encryptStoredOAuthToken(APPLE_REFRESH_TOKEN),
    )
    await db
      .update(user)
      .set({ deletedAt: new Date('2026-01-01T00:00:00.000Z') })
      .where(eq(user.id, stale))
    enableAppleSignIn()
    const fetchMock = vi.fn(
      async () =>
        new Response('invalid_grant', { status: APPLE_REVOKE_REFUSED_STATUS }),
    )
    vi.stubGlobal('fetch', fetchMock)
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
      expect(appleRevokeCalls(fetchMock)).toHaveLength(1)
      expect(
        lines.filter(
          (line) => line.message === APPLE_REFRESH_TOKEN_REVOKE_FAILED,
        ),
      ).toEqual([
        {
          level: 'warn',
          message: APPLE_REFRESH_TOKEN_REVOKE_FAILED,
          fields: {
            userId: stale,
            reason: `Apple returned ${APPLE_REVOKE_REFUSED_STATUS}`,
          },
        },
      ])
    } finally {
      await db.delete(user).where(eq(user.id, stale))
    }
  })

  it('retries a person delete that failed last time', async () => {
    const leftover = 'delete-account-erase-retry'
    await db.insert(pendingPersonErasure).values({ accountId: leftover })
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
