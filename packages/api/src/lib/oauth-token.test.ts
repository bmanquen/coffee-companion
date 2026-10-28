import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  OAUTH_TOKEN_SECRET_MISSING,
  decryptStoredOAuthToken,
  encryptStoredOAuthToken,
  isEncryptedOAuthToken,
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

describe('isEncryptedOAuthToken', () => {
  it('does not treat plaintext hex as ciphertext', async () => {
    await expect(isEncryptedOAuthToken('0123456789abcdef')).resolves.toBe(false)
  })

  it('recognizes real bare-hex ciphertext and decrypts it', async () => {
    const stored = await encryptStoredOAuthToken(REFRESH)
    expect(stored).toMatch(/^[0-9a-f]+$/i)
    await expect(isEncryptedOAuthToken(stored)).resolves.toBe(true)
    await expect(decryptStoredOAuthToken(stored)).resolves.toBe(REFRESH)
  })

  it('still treats a $ba$ envelope as encrypted', async () => {
    await expect(isEncryptedOAuthToken('$ba$1$deadbeef')).resolves.toBe(true)
  })

  it('does not treat bare hex as encrypted when the secret is missing', async () => {
    const stored = await encryptStoredOAuthToken(REFRESH)
    delete process.env.BETTER_AUTH_SECRET
    await expect(isEncryptedOAuthToken(stored)).resolves.toBe(false)
  })
})
