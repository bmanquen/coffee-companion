import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { user } from '../db/schema'
import { unverifiedEmailPlaceholder } from './account-email'
import {
  releaseUnverifiedEmailFromVerifiedSocial,
  rememberReleasedEmailHold,
  restoreOrphanedEmailHoldIfUnowned,
  restoreReleasedEmailHoldIfSignInFailed,
  takeUnverifiedEmailHold,
} from './account-email-hold'

function jwtWithEmail(email: string, emailVerified = true) {
  const payload = Buffer.from(
    JSON.stringify({ email, email_verified: emailVerified }),
  ).toString('base64url')
  return `header.${payload}.sig`
}

afterAll(async () => {
  await db.$client.end()
})

describe('restoreReleasedEmailHoldIfSignInFailed', () => {
  it('restores the hold for a user-only response and keeps it released when a session came back', async () => {
    const restoreId = globalThis.crypto.randomUUID()
    const keepId = globalThis.crypto.randomUUID()
    const restoreEmail = `${restoreId}@example.com`
    const keepEmail = `${keepId}@example.com`
    await db.insert(user).values([
      {
        id: restoreId,
        name: 'Hold restore',
        email: restoreEmail,
        emailVerified: false,
      },
      {
        id: keepId,
        name: 'Hold keep',
        email: keepEmail,
        emailVerified: false,
      },
    ])

    try {
      expect(await takeUnverifiedEmailHold(restoreEmail)).toEqual({
        email: restoreEmail,
        userId: restoreId,
      })
      expect(await takeUnverifiedEmailHold(keepEmail)).toEqual({
        email: keepEmail,
        userId: keepId,
      })

      const restoreContext: { returned?: unknown } = {
        returned: { user: { id: restoreId } },
      }
      rememberReleasedEmailHold(restoreContext, {
        email: restoreEmail,
        userId: restoreId,
      })
      await restoreReleasedEmailHoldIfSignInFailed(restoreContext)
      expect(
        (await db.query.user.findFirst({ where: { id: restoreId } }))?.email,
      ).toBe(restoreEmail)

      const keepContext: { returned?: unknown } = {
        returned: { token: 'session-token', user: { id: keepId } },
      }
      rememberReleasedEmailHold(keepContext, {
        email: keepEmail,
        userId: keepId,
      })
      await restoreReleasedEmailHoldIfSignInFailed(keepContext)
      expect(
        (await db.query.user.findFirst({ where: { id: keepId } }))?.email,
      ).toBe(unverifiedEmailPlaceholder(keepId, keepEmail))
    } finally {
      await db.delete(user).where(eq(user.id, restoreId))
      await db.delete(user).where(eq(user.id, keepId))
    }
  })
})

describe('takeUnverifiedEmailHold', () => {
  it('takes nothing when the occupant is verified between the read and the write', async () => {
    const id = globalThis.crypto.randomUUID()
    const email = `${id}@example.com`
    await db.insert(user).values({
      id,
      name: 'Hold race',
      email,
      emailVerified: false,
    })

    try {
      const snapshot = await db.query.user.findFirst({ where: { id } })
      await db
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.id, id))

      const store = {
        query: {
          user: {
            findFirst: async () => snapshot,
          },
        },
        update: db.update.bind(db),
      } as NonNullable<Parameters<typeof takeUnverifiedEmailHold>[1]>

      expect(await takeUnverifiedEmailHold(email, store)).toBeNull()
      const stored = await db.query.user.findFirst({ where: { id } })
      expect(stored?.email).toBe(email)
      expect(stored?.emailVerified).toBe(true)
    } finally {
      await db.delete(user).where(eq(user.id, id))
    }
  })
})

describe('orphaned email hold restore', () => {
  it('restores a released hold on the next sign-in that is not a verified claim', async () => {
    const id = globalThis.crypto.randomUUID()
    const email = `${id}@example.com`
    await db.insert(user).values({
      id,
      name: 'Hold crash',
      email,
      emailVerified: false,
    })

    try {
      expect(await takeUnverifiedEmailHold(email)).toEqual({
        email,
        userId: id,
      })
      expect(
        (await db.query.user.findFirst({ where: { id } }))?.email,
      ).toBe(unverifiedEmailPlaceholder(id, email))

      await releaseUnverifiedEmailFromVerifiedSocial(
        {
          provider: 'google',
          idToken: { token: jwtWithEmail(email) },
        },
        [{ id: 'google', verifyIdToken: async () => false }],
      )

      expect((await db.query.user.findFirst({ where: { id } }))?.email).toBe(
        email,
      )
    } finally {
      await db.delete(user).where(eq(user.id, id))
    }
  })

  it('does not restore when a verified user already owns the address', async () => {
    const holderId = globalThis.crypto.randomUUID()
    const ownerId = globalThis.crypto.randomUUID()
    const email = `${holderId}@example.com`
    await db.insert(user).values([
      {
        id: holderId,
        name: 'Hold leftover',
        email,
        emailVerified: false,
      },
      {
        id: ownerId,
        name: 'Verified owner',
        email: `${ownerId}@example.com`,
        emailVerified: true,
      },
    ])

    try {
      expect(await takeUnverifiedEmailHold(email)).toEqual({
        email,
        userId: holderId,
      })
      await db
        .update(user)
        .set({ email })
        .where(eq(user.id, ownerId))

      expect(await restoreOrphanedEmailHoldIfUnowned(email)).toBe('kept')
      expect(
        (await db.query.user.findFirst({ where: { id: holderId } }))?.email,
      ).toBe(unverifiedEmailPlaceholder(holderId, email))
      expect(
        (await db.query.user.findFirst({ where: { id: ownerId } }))?.email,
      ).toBe(email)
    } finally {
      await db.delete(user).where(eq(user.id, holderId))
      await db.delete(user).where(eq(user.id, ownerId))
    }
  })

  it('does not restore during a verified sign-in that is about to claim the address', async () => {
    const id = globalThis.crypto.randomUUID()
    const email = `${id}@example.com`
    await db.insert(user).values({
      id,
      name: 'Hold claim',
      email,
      emailVerified: false,
    })

    try {
      expect(await takeUnverifiedEmailHold(email)).toEqual({
        email,
        userId: id,
      })

      expect(
        await releaseUnverifiedEmailFromVerifiedSocial(
          {
            provider: 'google',
            idToken: { token: jwtWithEmail(email) },
          },
          [
            {
              id: 'google',
              verifyIdToken: async () => true,
              getUserInfo: async () => ({
                user: { email, emailVerified: true },
              }),
            },
          ],
        ),
      ).toBeNull()

      expect((await db.query.user.findFirst({ where: { id } }))?.email).toBe(
        unverifiedEmailPlaceholder(id, email),
      )
      expect(await db.query.user.findFirst({ where: { email } })).toBeUndefined()
    } finally {
      await db.delete(user).where(eq(user.id, id))
    }
  })
})
