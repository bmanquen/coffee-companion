import { afterAll, describe, expect, it } from 'vitest'
import { decryptOAuthToken } from 'better-auth/oauth2'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { account, user } from '../db/schema'
import { GOOGLE_PROVIDER_ID } from './account-linking'
import { auth } from './auth'
import { decryptStoredOAuthToken, isEncryptedOAuthToken } from './oauth-token'

const PLAIN_REFRESH = '1//0g-legacy-google-refresh'
const PLAIN_ACCESS = 'ya29.legacy-google-access'

afterAll(async () => {
  await db.$client.end()
})

describe('plaintext OAuth rows', () => {
  it('reads a legacy plaintext Google row while encryptOAuthTokens is on', async () => {
    const userId = globalThis.crypto.randomUUID()
    const accountId = globalThis.crypto.randomUUID()
    await db.insert(user).values({
      id: userId,
      name: 'Legacy Google read',
      email: `${userId}@example.com`,
      emailVerified: true,
    })

    try {
      await db.insert(account).values({
        id: accountId,
        accountId: `google.${userId}`,
        providerId: GOOGLE_PROVIDER_ID,
        userId,
        accessToken: PLAIN_ACCESS,
        refreshToken: PLAIN_REFRESH,
      })

      const ctx = await auth.$context
      expect(ctx.options.account.encryptOAuthTokens).toBe(true)
      const decryptCtx = ctx as unknown as Parameters<
        typeof decryptOAuthToken
      >[1]

      const row = await db.query.account.findFirst({
        where: { id: accountId },
      })
      expect(row?.refreshToken).toBe(PLAIN_REFRESH)
      expect(isEncryptedOAuthToken(row?.refreshToken ?? '')).toBe(false)
      await expect(decryptStoredOAuthToken(row?.refreshToken)).resolves.toBe(
        PLAIN_REFRESH,
      )
      await expect(decryptStoredOAuthToken(row?.accessToken)).resolves.toBe(
        PLAIN_ACCESS,
      )

      expect(await decryptOAuthToken(row?.refreshToken ?? '', decryptCtx)).toBe(
        PLAIN_REFRESH,
      )
      expect(await decryptOAuthToken(row?.accessToken ?? '', decryptCtx)).toBe(
        PLAIN_ACCESS,
      )
    } finally {
      await db.delete(user).where(eq(user.id, userId))
    }
  })
})
