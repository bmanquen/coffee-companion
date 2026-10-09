import { afterAll, describe, expect, it } from 'vitest'
import { inArray } from 'drizzle-orm'
import { SignJWT, exportJWK, exportPKCS8, generateKeyPair } from 'jose'
import { db } from '../db'
import { session, user } from '../db/schema'
import {
  APPLE_ISSUER,
  APPLE_PROVIDER_ID,
  AppleIdentityInvalid,
  AppleSignInRefused,
  AppleTokenExchangeFailed,
  appleAccountOf,
  appleLocalJwks,
  signInWithAppleNative,
} from './apple'
import type { AppleCrypto, AppleNativeConfig } from './apple'

const BUNDLE_ID = 'dev.offbyonelabs.coffeecompanion'
const KEY_ID = 'INTGKEY1'
const TEAM_ID = 'TEAMINTG01'
const createdUserIds: Array<string> = []

afterAll(async () => {
  if (createdUserIds.length) {
    await db.delete(user).where(inArray(user.id, createdUserIds))
  }
  await db.$client.end()
})

async function fixture() {
  const pair = await generateKeyPair('ES256', { extractable: true })
  const jwk = await exportJWK(pair.publicKey)
  jwk.kid = KEY_ID
  jwk.alg = 'ES256'
  jwk.use = 'sig'
  const config: AppleNativeConfig = {
    bundleId: BUNDLE_ID,
    teamId: TEAM_ID,
    keyId: KEY_ID,
    privateKey: await exportPKCS8(pair.privateKey),
  }

  const identityToken = (
    subject: string,
    claims: Record<string, unknown> = {},
    {
      issuer = APPLE_ISSUER,
      audience = BUNDLE_ID,
      expires = '5m',
    }: {
      issuer?: string
      audience?: string
      expires?: string | number
    } = {},
  ) =>
    new SignJWT({
      email_verified: 'true',
      ...claims,
    })
      .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime(expires)
      .sign(pair.privateKey)

  const tokens = (
    overrides: {
      refresh_token?: string | null
      status?: number
      now?: () => number
    } = {},
  ): AppleCrypto => ({
    verifyKey: appleLocalJwks([jwk]),
    now: overrides.now,
    fetch: async () => {
      if (overrides.status && overrides.status >= 400) {
        return new Response('invalid_grant', { status: overrides.status })
      }
      return Response.json({
        refresh_token:
          overrides.refresh_token === null
            ? undefined
            : (overrides.refresh_token ?? 'rt_first'),
        access_token: 'at_1',
        id_token: 'id_from_apple',
      })
    },
  })

  return { config, identityToken, tokens }
}

function remember(id: string) {
  createdUserIds.push(id)
  return id
}

describe('signInWithAppleNative', () => {
  it('creates the user from the verified token and keeps Apple’s refresh token', async () => {
    const { config, identityToken, tokens } = await fixture()
    const result = await signInWithAppleNative(
      {
        identityToken: await identityToken('apple.sub.create', {
          email: 'create@privaterelay.appleid.com',
        }),
        authorizationCode: 'auth-first',
        fullName: { givenName: 'Ada', familyName: 'Lovelace' },
        email: 'forged@evil.example',
      },
      config,
      tokens(),
    )
    remember(result.user.id)

    expect(result.user.email).toBe('create@privaterelay.appleid.com')
    expect(result.user.name).toBe('Ada Lovelace')
    expect(result.session.token).toMatch(/^[0-9a-f]{64}$/)

    const row = await appleAccountOf(result.user.id)
    expect(row?.providerId).toBe(APPLE_PROVIDER_ID)
    expect(row?.accountId).toBe('apple.sub.create')
    expect(row?.refreshToken).toBe('rt_first')

    const stored = await db.query.session.findFirst({
      where: { token: result.session.token },
    })
    expect(stored?.userId).toBe(result.user.id)
  })

  it('keeps the first name and refresh token when Apple omits them later', async () => {
    const { config, identityToken, tokens } = await fixture()
    const first = await signInWithAppleNative(
      {
        identityToken: await identityToken('apple.sub.again', {
          email: 'again@privaterelay.appleid.com',
        }),
        authorizationCode: 'auth-first',
        fullName: { givenName: 'Ada', familyName: 'Lovelace' },
      },
      config,
      tokens(),
    )
    remember(first.user.id)

    const again = await signInWithAppleNative(
      {
        identityToken: await identityToken('apple.sub.again'),
        authorizationCode: 'auth-again',
        fullName: { givenName: null, familyName: null },
      },
      config,
      tokens({ refresh_token: null }),
    )

    expect(again.user.id).toBe(first.user.id)
    expect(again.user.name).toBe('Ada Lovelace')
    expect(again.user.email).toBe(first.user.email)
    expect(again.session.token).not.toBe(first.session.token)

    const row = await appleAccountOf(first.user.id)
    expect(row?.refreshToken).toBe('rt_first')
  })

  it('links Apple to the existing account that already holds that email', async () => {
    const linkedId = remember(globalThis.crypto.randomUUID())
    await db.insert(user).values({
      id: linkedId,
      name: 'Already Here',
      email: `${linkedId}@example.com`,
    })
    const { config, identityToken, tokens } = await fixture()

    const result = await signInWithAppleNative(
      {
        identityToken: await identityToken('apple.sub.link', {
          email: `${linkedId}@example.com`,
        }),
        authorizationCode: 'auth-link',
      },
      config,
      tokens({ refresh_token: 'rt_link' }),
    )

    expect(result.user.id).toBe(linkedId)
    expect(result.user.name).toBe('Already Here')
    const row = await appleAccountOf(linkedId)
    expect(row?.accountId).toBe('apple.sub.link')
    expect(row?.refreshToken).toBe('rt_link')
  })

  it('does not create a session when the identity token fails verification', async () => {
    const { config, tokens } = await fixture()
    const before = await db.select().from(session)

    await expect(
      signInWithAppleNative(
        {
          identityToken: 'not-a-jwt',
          authorizationCode: 'auth-first',
        },
        config,
        tokens(),
      ),
    ).rejects.toBeInstanceOf(AppleIdentityInvalid)

    const after = await db.select().from(session)
    expect(after).toHaveLength(before.length)
  })

  it('does not create a session when Apple refuses the authorization code', async () => {
    const { config, identityToken, tokens } = await fixture()
    const usersBefore = await db.select().from(user)

    await expect(
      signInWithAppleNative(
        {
          identityToken: await identityToken('apple.sub.refused', {
            email: 'refused@privaterelay.appleid.com',
          }),
          authorizationCode: 'bad',
        },
        config,
        tokens({ status: 400 }),
      ),
    ).rejects.toBeInstanceOf(AppleTokenExchangeFailed)

    const usersAfter = await db.select().from(user)
    expect(usersAfter).toHaveLength(usersBefore.length)
  })

  it('refuses a first sign-in that has no email in the token or the credential', async () => {
    const { config, identityToken, tokens } = await fixture()

    await expect(
      signInWithAppleNative(
        {
          identityToken: await identityToken('apple.sub.no-email'),
          authorizationCode: 'auth-first',
        },
        config,
        tokens(),
      ),
    ).rejects.toBeInstanceOf(AppleSignInRefused)
  })

  it('persists the credential email when the token has none and no one holds it', async () => {
    const { config, identityToken, tokens } = await fixture()
    const result = await signInWithAppleNative(
      {
        identityToken: await identityToken('apple.sub.credential-email'),
        authorizationCode: 'auth-first',
        email: 'once@privaterelay.appleid.com',
        fullName: { givenName: 'Ada', familyName: 'Lovelace' },
      },
      config,
      tokens({ refresh_token: 'rt_once' }),
    )
    remember(result.user.id)

    expect(result.user.email).toBe('once@privaterelay.appleid.com')
    expect(result.user.name).toBe('Ada Lovelace')
    const row = await appleAccountOf(result.user.id)
    expect(row?.refreshToken).toBe('rt_once')
  })

  it('does not attach Apple to an existing user from a client-supplied email', async () => {
    const victimId = remember(globalThis.crypto.randomUUID())
    await db.insert(user).values({
      id: victimId,
      name: 'Already Here',
      email: `${victimId}@example.com`,
    })
    const { config, identityToken, tokens } = await fixture()

    await expect(
      signInWithAppleNative(
        {
          identityToken: await identityToken('apple.sub.forged-email'),
          authorizationCode: 'auth-forged',
          email: `${victimId}@example.com`,
        },
        config,
        tokens(),
      ),
    ).rejects.toBeInstanceOf(AppleSignInRefused)

    expect(await appleAccountOf(victimId)).toBeUndefined()
  })

  it('rejects a token from the wrong issuer before a session exists', async () => {
    const { config, identityToken, tokens } = await fixture()
    const before = await db.select().from(session)

    await expect(
      signInWithAppleNative(
        {
          identityToken: await identityToken(
            'apple.sub.issuer',
            { email: 'issuer@privaterelay.appleid.com' },
            { issuer: 'https://evil.example' },
          ),
          authorizationCode: 'auth-first',
        },
        config,
        tokens(),
      ),
    ).rejects.toBeInstanceOf(AppleIdentityInvalid)

    const after = await db.select().from(session)
    expect(after).toHaveLength(before.length)
  })

  it('rejects a token issued for another app before a session exists', async () => {
    const { config, identityToken, tokens } = await fixture()
    const before = await db.select().from(session)

    await expect(
      signInWithAppleNative(
        {
          identityToken: await identityToken(
            'apple.sub.aud',
            { email: 'aud@privaterelay.appleid.com' },
            { audience: 'com.other.app' },
          ),
          authorizationCode: 'auth-first',
        },
        config,
        tokens(),
      ),
    ).rejects.toBeInstanceOf(AppleIdentityInvalid)

    const after = await db.select().from(session)
    expect(after).toHaveLength(before.length)
  })

  it('rejects a token signed by someone else before a session exists', async () => {
    const { config, tokens } = await fixture()
    const other = await generateKeyPair('ES256')
    const forged = await new SignJWT({
      email: 'forged-sig@privaterelay.appleid.com',
      email_verified: 'true',
    })
      .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
      .setIssuer(APPLE_ISSUER)
      .setAudience(BUNDLE_ID)
      .setSubject('apple.sub.forged-sig')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(other.privateKey)
    const before = await db.select().from(session)

    await expect(
      signInWithAppleNative(
        {
          identityToken: forged,
          authorizationCode: 'auth-first',
        },
        config,
        tokens(),
      ),
    ).rejects.toBeInstanceOf(AppleIdentityInvalid)

    const after = await db.select().from(session)
    expect(after).toHaveLength(before.length)
  })

  it('rejects an expired token before a session exists', async () => {
    const { config, identityToken, tokens } = await fixture()
    const before = await db.select().from(session)

    await expect(
      signInWithAppleNative(
        {
          identityToken: await identityToken(
            'apple.sub.expired',
            { email: 'expired@privaterelay.appleid.com' },
            { expires: 0 },
          ),
          authorizationCode: 'auth-first',
        },
        config,
        tokens({ now: () => Date.now() + 60_000 }),
      ),
    ).rejects.toBeInstanceOf(AppleIdentityInvalid)

    const after = await db.select().from(session)
    expect(after).toHaveLength(before.length)
  })
})
