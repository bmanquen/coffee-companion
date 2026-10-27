import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { account, user } from '../db/schema'
import { GOOGLE_PROVIDER_ID } from './account-linking'
import { decryptStoredOAuthToken, isEncryptedOAuthToken } from './oauth-token'
import { encryptLegacyOAuthTokens } from './oauth-token-legacy'

const PLAIN_REFRESH = 'rt_google_legacy_plaintext'
const PLAIN_ACCESS = 'at_google_legacy_plaintext'

afterAll(async () => {
  await db.$client.end()
})

describe('encryptLegacyOAuthTokens', () => {
  it('reads a legacy plaintext Google token and encrypts it on write', async () => {
    const userId = globalThis.crypto.randomUUID()
    const accountId = globalThis.crypto.randomUUID()
    await db.insert(user).values({
      id: userId,
      name: 'Legacy Google',
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

      const before = await db.query.account.findFirst({
        where: { id: accountId },
      })
      expect(before?.refreshToken).toBe(PLAIN_REFRESH)
      expect(isEncryptedOAuthToken(before?.refreshToken ?? '')).toBe(false)
      await expect(decryptStoredOAuthToken(before?.refreshToken)).resolves.toBe(
        PLAIN_REFRESH,
      )

      expect(await encryptLegacyOAuthTokens()).toBeGreaterThanOrEqual(1)

      const after = await db.query.account.findFirst({
        where: { id: accountId },
      })
      expect(after?.refreshToken).not.toBe(PLAIN_REFRESH)
      expect(after?.accessToken).not.toBe(PLAIN_ACCESS)
      expect(isEncryptedOAuthToken(after?.refreshToken ?? '')).toBe(true)
      await expect(decryptStoredOAuthToken(after?.refreshToken)).resolves.toBe(
        PLAIN_REFRESH,
      )
      await expect(decryptStoredOAuthToken(after?.accessToken)).resolves.toBe(
        PLAIN_ACCESS,
      )

      expect(await encryptLegacyOAuthTokens()).toBe(0)
    } finally {
      await db.delete(user).where(eq(user.id, userId))
    }
  })
})
