import { afterAll, describe, expect, it } from 'vitest'
import { decryptOAuthToken } from 'better-auth/oauth2'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { account, user } from '../db/schema'
import { GOOGLE_PROVIDER_ID } from './account-linking'
import { auth } from './auth'
import {
  decryptStoredOAuthToken,
  encryptStoredOAuthToken,
  isEncryptedOAuthToken,
} from './oauth-token'
import { encryptLegacyOAuthTokens } from './oauth-token-legacy'
import type { TokenStore } from './oauth-token-legacy'

const PLAIN_REFRESH = '1//0g-legacy-google-refresh'
const PLAIN_ACCESS = 'ya29.legacy-google-access'

afterAll(async () => {
  await db.$client.end()
})

describe('encryptLegacyOAuthTokens', () => {
  it('encrypts a plaintext Google row and is a no-op on the second run', async () => {
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
      await expect(
        isEncryptedOAuthToken(before?.refreshToken ?? ''),
      ).resolves.toBe(false)
      await expect(decryptStoredOAuthToken(before?.refreshToken)).resolves.toBe(
        PLAIN_REFRESH,
      )

      expect((await encryptLegacyOAuthTokens()).updated).toBeGreaterThanOrEqual(
        1,
      )

      const after = await db.query.account.findFirst({
        where: { id: accountId },
      })
      expect(after?.refreshToken).not.toBe(PLAIN_REFRESH)
      expect(after?.accessToken).not.toBe(PLAIN_ACCESS)
      await expect(
        isEncryptedOAuthToken(after?.refreshToken ?? ''),
      ).resolves.toBe(true)
      await expect(decryptStoredOAuthToken(after?.refreshToken)).resolves.toBe(
        PLAIN_REFRESH,
      )
      await expect(decryptStoredOAuthToken(after?.accessToken)).resolves.toBe(
        PLAIN_ACCESS,
      )

      expect((await encryptLegacyOAuthTokens()).updated).toBe(0)
    } finally {
      await db.delete(user).where(eq(user.id, userId))
    }
  })

  it('leaves plaintext hex unchanged and counts it as skipped_undecryptable', async () => {
    const userId = globalThis.crypto.randomUUID()
    const accountId = globalThis.crypto.randomUUID()
    const plaintextHex = '0123456789abcdef'
    await db.insert(user).values({
      id: userId,
      name: 'Legacy hex Google',
      email: `${userId}@example.com`,
      emailVerified: true,
    })

    try {
      await db.insert(account).values({
        id: accountId,
        accountId: `google.${userId}`,
        providerId: GOOGLE_PROVIDER_ID,
        userId,
        accessToken: plaintextHex,
        refreshToken: plaintextHex,
      })

      await expect(isEncryptedOAuthToken(plaintextHex)).resolves.toBe(false)
      const result = await encryptLegacyOAuthTokens()
      expect(result.skippedUndecryptable).toBeGreaterThanOrEqual(2)

      const after = await db.query.account.findFirst({
        where: { id: accountId },
      })
      expect(after?.refreshToken).toBe(plaintextHex)
      expect(after?.accessToken).toBe(plaintextHex)
    } finally {
      await db.delete(user).where(eq(user.id, userId))
    }
  })

  it('leaves ciphertext from a different secret untouched', async () => {
    const userId = globalThis.crypto.randomUUID()
    const accountId = globalThis.crypto.randomUUID()
    const previous = process.env.BETTER_AUTH_SECRET
    process.env.BETTER_AUTH_SECRET = 'other-oauth-token-secret-fixture-32b!'
    let accessCipher: string
    let refreshCipher: string
    try {
      accessCipher = await encryptStoredOAuthToken(PLAIN_ACCESS)
      refreshCipher = await encryptStoredOAuthToken(PLAIN_REFRESH)
    } finally {
      if (previous === undefined) delete process.env.BETTER_AUTH_SECRET
      else process.env.BETTER_AUTH_SECRET = previous
    }

    await db.insert(user).values({
      id: userId,
      name: 'Legacy rotated secret',
      email: `${userId}@example.com`,
      emailVerified: true,
    })

    try {
      await db.insert(account).values({
        id: accountId,
        accountId: `google.${userId}`,
        providerId: GOOGLE_PROVIDER_ID,
        userId,
        accessToken: accessCipher,
        refreshToken: refreshCipher,
      })

      await expect(isEncryptedOAuthToken(refreshCipher)).resolves.toBe(false)
      const result = await encryptLegacyOAuthTokens()
      expect(result.skippedUndecryptable).toBeGreaterThanOrEqual(2)

      const after = await db.query.account.findFirst({
        where: { id: accountId },
      })
      expect(after?.accessToken).toBe(accessCipher)
      expect(after?.refreshToken).toBe(refreshCipher)
    } finally {
      await db.delete(user).where(eq(user.id, userId))
    }
  })

  it('leaves a row untouched when tokens change between read and write', async () => {
    const userId = globalThis.crypto.randomUUID()
    const accountId = globalThis.crypto.randomUUID()
    const freshAccess = 'ya29.fresh-from-sign-in'
    const freshRefresh = '1//0g-fresh-from-sign-in'
    await db.insert(user).values({
      id: userId,
      name: 'Legacy Google race',
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

      const racing = {
        query: {
          account: {
            findMany: async () => {
              const snapshot = await db.query.account.findFirst({
                where: { id: accountId },
              })
              await db
                .update(account)
                .set({
                  accessToken: freshAccess,
                  refreshToken: freshRefresh,
                })
                .where(eq(account.id, accountId))
              return snapshot ? [snapshot] : []
            },
          },
        },
        update: (table: typeof account) => db.update(table),
      }

      expect((await encryptLegacyOAuthTokens(racing as TokenStore)).updated).toBe(
        0,
      )

      const raced = await db.query.account.findFirst({
        where: { id: accountId },
      })
      expect(raced?.accessToken).toBe(freshAccess)
      expect(raced?.refreshToken).toBe(freshRefresh)

      expect((await encryptLegacyOAuthTokens()).updated).toBeGreaterThanOrEqual(
        1,
      )
      const later = await db.query.account.findFirst({
        where: { id: accountId },
      })
      await expect(
        isEncryptedOAuthToken(later?.refreshToken ?? ''),
      ).resolves.toBe(true)
      await expect(decryptStoredOAuthToken(later?.refreshToken)).resolves.toBe(
        freshRefresh,
      )
    } finally {
      await db.delete(user).where(eq(user.id, userId))
    }
  })
})

describe('better-auth decryptOAuthToken', () => {
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
      await expect(
        isEncryptedOAuthToken(row?.refreshToken ?? ''),
      ).resolves.toBe(false)

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
