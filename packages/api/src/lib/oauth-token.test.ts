import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  OAUTH_TOKEN_SECRET_MISSING,
  decryptStoredOAuthToken,
  encryptStoredOAuthToken,
} from './oauth-token'

const SECRET = 'test-oauth-token-secret-fixture-32b!'
const REFRESH = 'rt_apple_refresh'

let saved: string | undefined

beforeEach(() => {
  saved = process.env.BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_SECRET = SECRET
})

afterEach(() => {
  if (saved === undefined) delete process.env.BETTER_AUTH_SECRET
  else process.env.BETTER_AUTH_SECRET = saved
})

describe('encryptStoredOAuthToken', () => {
  it('round-trips a refresh token and does not store it in the clear', async () => {
    const stored = await encryptStoredOAuthToken(REFRESH)
    expect(stored).not.toBe(REFRESH)
    expect(stored).not.toBeNull()
    await expect(decryptStoredOAuthToken(stored)).resolves.toBe(REFRESH)
  })

  it('leaves a missing token missing', async () => {
    await expect(encryptStoredOAuthToken(null)).resolves.toBeNull()
    await expect(decryptStoredOAuthToken(null)).resolves.toBeNull()
  })

  it('still reads a token stored before encryption was on', async () => {
    await expect(decryptStoredOAuthToken(REFRESH)).resolves.toBe(REFRESH)
  })

  it('treats a legacy Google refresh token as plaintext', async () => {
    const google = '1//0g-legacy-google-refresh'
    await expect(decryptStoredOAuthToken(google)).resolves.toBe(google)
    const stored = await encryptStoredOAuthToken(google)
    expect(stored).not.toBe(google)
    await expect(decryptStoredOAuthToken(stored)).resolves.toBe(google)
  })

  it('refuses to store a token when the secret is missing', async () => {
    delete process.env.BETTER_AUTH_SECRET
    await expect(encryptStoredOAuthToken(REFRESH)).rejects.toThrow(
      OAUTH_TOKEN_SECRET_MISSING,
    )
  })
})

describe('decryptStoredOAuthToken', () => {
  it('throws for ciphertext when the secret is missing, and returns plaintext', async () => {
    const stored = await encryptStoredOAuthToken(REFRESH)
    const google = '1//0g-legacy-google-refresh'
    delete process.env.BETTER_AUTH_SECRET
    await expect(decryptStoredOAuthToken(stored)).rejects.toThrow(
      OAUTH_TOKEN_SECRET_MISSING,
    )
    await expect(decryptStoredOAuthToken(google)).resolves.toBe(google)
    await expect(decryptStoredOAuthToken(null)).resolves.toBeNull()
  })
})
