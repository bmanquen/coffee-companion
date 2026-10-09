import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  SignJWT,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  jwtVerify,
} from 'jose'
import {
  APPLE_CLIENT_SECRET_TTL_SECONDS,
  APPLE_ISSUER,
  AppleIdentityInvalid,
  AppleNotConfigured,
  AppleTokenExchangeFailed,
  appleClientSecret,
  appleLocalJwks,
  appleNativeConfig,
  exchangeAppleAuthorizationCode,
  verifyAppleIdentityToken,
} from './apple'
import type { AppleNativeConfig } from './apple'

const BUNDLE_ID = 'com.bmanquen.coffeecompanion'
const KEY_ID = 'TESTKEY1'
const TEAM_ID = 'TEAM123456'

const vars = [
  'APPLE_BUNDLE_ID',
  'APPLE_TEAM_ID',
  'APPLE_KEY_ID',
  'APPLE_PRIVATE_KEY',
] as const

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(vars.map((name) => [name, process.env[name]]))
  for (const name of vars) delete process.env[name]
})

afterEach(() => {
  for (const name of vars) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
})

async function appleKeys() {
  const pair = await generateKeyPair('ES256', { extractable: true })
  const jwk = await exportJWK(pair.publicKey)
  jwk.kid = KEY_ID
  jwk.alg = 'ES256'
  jwk.use = 'sig'
  const privateKey = await exportPKCS8(pair.privateKey)
  return {
    privateKey,
    verifyKey: appleLocalJwks([jwk]),
    sign: pair.privateKey,
    config: {
      bundleId: BUNDLE_ID,
      teamId: TEAM_ID,
      keyId: KEY_ID,
      privateKey,
    } satisfies AppleNativeConfig,
  }
}

async function identityToken(
  sign: CryptoKey,
  claims: Record<string, unknown> = {},
  {
    issuer = APPLE_ISSUER,
    audience = BUNDLE_ID,
    subject = 'apple-user-1',
    expires = '5m',
  }: {
    issuer?: string
    audience?: string
    subject?: string
    expires?: string | number
  } = {},
) {
  return new SignJWT({
    email: 'ada@privaterelay.appleid.com',
    email_verified: 'true',
    ...claims,
  })
    .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(sign)
}

describe('appleNativeConfig', () => {
  it('is off when the bundle id is unset', () => {
    expect(appleNativeConfig()).toBe(null)
  })

  it('refuses a half-configured deployment', () => {
    process.env.APPLE_BUNDLE_ID = BUNDLE_ID
    expect(() => appleNativeConfig()).toThrow(AppleNotConfigured)
  })

  it('reads the key material once every field is set', () => {
    process.env.APPLE_BUNDLE_ID = BUNDLE_ID
    process.env.APPLE_TEAM_ID = TEAM_ID
    process.env.APPLE_KEY_ID = KEY_ID
    process.env.APPLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nM\n-----END PRIVATE KEY-----'

    expect(appleNativeConfig()).toEqual({
      bundleId: BUNDLE_ID,
      teamId: TEAM_ID,
      keyId: KEY_ID,
      privateKey: process.env.APPLE_PRIVATE_KEY,
    })
  })
})

describe('verifyAppleIdentityToken', () => {
  it('accepts a token Apple signed for this bundle', async () => {
    const keys = await appleKeys()
    const token = await identityToken(keys.sign)

    await expect(
      verifyAppleIdentityToken(token, BUNDLE_ID, { verifyKey: keys.verifyKey }),
    ).resolves.toEqual({
      subject: 'apple-user-1',
      email: 'ada@privaterelay.appleid.com',
      emailVerified: true,
    })
  })

  it('rejects a token from the wrong issuer', async () => {
    const keys = await appleKeys()
    const token = await identityToken(keys.sign, {}, { issuer: 'https://evil.example' })

    await expect(
      verifyAppleIdentityToken(token, BUNDLE_ID, { verifyKey: keys.verifyKey }),
    ).rejects.toBeInstanceOf(AppleIdentityInvalid)
  })

  it('rejects a token issued for another app', async () => {
    const keys = await appleKeys()
    const token = await identityToken(
      keys.sign,
      {},
      { audience: 'com.other.app' },
    )

    await expect(
      verifyAppleIdentityToken(token, BUNDLE_ID, { verifyKey: keys.verifyKey }),
    ).rejects.toBeInstanceOf(AppleIdentityInvalid)
  })

  it('rejects an expired token', async () => {
    const keys = await appleKeys()
    const token = await identityToken(keys.sign, {}, { expires: 0 })

    await expect(
      verifyAppleIdentityToken(token, BUNDLE_ID, {
        verifyKey: keys.verifyKey,
        now: () => Date.now() + 60_000,
      }),
    ).rejects.toBeInstanceOf(AppleIdentityInvalid)
  })

  it('rejects a token signed by someone else', async () => {
    const keys = await appleKeys()
    const other = await generateKeyPair('ES256')
    const token = await identityToken(other.privateKey)

    await expect(
      verifyAppleIdentityToken(token, BUNDLE_ID, { verifyKey: keys.verifyKey }),
    ).rejects.toBeInstanceOf(AppleIdentityInvalid)
  })

  it('reads email only from the token claims', async () => {
    const keys = await appleKeys()
    const token = await identityToken(keys.sign, {
      email: 'relay@privaterelay.appleid.com',
    })

    const identity = await verifyAppleIdentityToken(token, BUNDLE_ID, {
      verifyKey: keys.verifyKey,
    })
    expect(identity.email).toBe('relay@privaterelay.appleid.com')
    expect(identity.subject).toBe('apple-user-1')
  })
})

describe('appleClientSecret', () => {
  it('is a JWT Apple will accept as this app', async () => {
    const keys = await appleKeys()
    const issuedAt = 1_700_000_000_000
    const secret = await appleClientSecret(keys.config, () => issuedAt)
    const { payload, protectedHeader } = await jwtVerify(
      secret,
      keys.verifyKey,
      {
        issuer: TEAM_ID,
        audience: APPLE_ISSUER,
        subject: BUNDLE_ID,
        currentDate: new Date(issuedAt),
      },
    )

    expect(protectedHeader.kid).toBe(KEY_ID)
    expect(protectedHeader.alg).toBe('ES256')
    expect(payload.exp).toBe(
      Math.floor(issuedAt / 1000) + APPLE_CLIENT_SECRET_TTL_SECONDS,
    )
  })
})

describe('exchangeAppleAuthorizationCode', () => {
  it('sends the code and stores the refresh token Apple returns', async () => {
    const keys = await appleKeys()
    const fetchMock: typeof fetch = async (_url, init) => {
      const body = String(init?.body)
      expect(body).toContain('grant_type=authorization_code')
      expect(body).toContain('code=auth-code-1')
      expect(body).toContain(`client_id=${BUNDLE_ID}`)
      return Response.json({
        refresh_token: 'rt_first',
        access_token: 'at_1',
        id_token: 'id_1',
      })
    }

    await expect(
      exchangeAppleAuthorizationCode('auth-code-1', keys.config, {
        verifyKey: keys.verifyKey,
        fetch: fetchMock,
      }),
    ).resolves.toEqual({
      refreshToken: 'rt_first',
      accessToken: 'at_1',
      idToken: 'id_1',
    })
  })

  it('refuses a rejected code so a session is not created from it', async () => {
    const keys = await appleKeys()
    const fetchMock: typeof fetch = async () =>
      new Response('invalid_grant', { status: 400 })

    await expect(
      exchangeAppleAuthorizationCode('bad', keys.config, {
        verifyKey: keys.verifyKey,
        fetch: fetchMock,
      }),
    ).rejects.toBeInstanceOf(AppleTokenExchangeFailed)
  })
})
