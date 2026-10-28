import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { user } from '../db/schema'
import { unverifiedEmailPlaceholder } from './account-email'
import {
  rememberReleasedEmailHold,
  restoreReleasedEmailHoldIfSignInFailed,
  takeUnverifiedEmailHold,
} from './account-email-hold'

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
      ).toBe(unverifiedEmailPlaceholder(keepId))
    } finally {
      await db.delete(user).where(eq(user.id, restoreId))
      await db.delete(user).where(eq(user.id, keepId))
    }
  })
})
