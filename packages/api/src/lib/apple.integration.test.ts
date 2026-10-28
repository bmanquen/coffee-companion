import { afterAll, describe, expect, it } from 'vitest'
import { inArray, sql } from 'drizzle-orm'
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
  appleRefreshTokenOf,
  signInWithAppleNative,
} from './apple'
import {
  EMAIL_ALREADY_ASSOCIATED_CODE,
  unverifiedEmailPlaceholder,
} from './account-email'
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
      subject?: string
      refresh_token?: string | null
      id_token?: string | null
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
      const idToken =
        overrides.id_token === null
          ? undefined
          : (overrides.id_token ??
            (overrides.subject
              ? await identityToken(overrides.subject)
              : undefined))
      return Response.json({
        refresh_token:
          overrides.refresh_token === null
            ? undefined
            : (overrides.refresh_token ?? 'rt_first'),
        access_token: 'at_1',
        id_token: idToken,
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
      tokens({ subject: 'apple.sub.create' }),
    )
    remember(result.user.id)

    expect(result.user.email).toBe('create@privaterelay.appleid.com')
    expect(result.user.name).toBe('Ada Lovelace')
    expect(result.user.emailVerified).toBe(true)
    expect(result.session.token).toMatch(/^[0-9a-f]{64}$/)

    const row = await appleAccountOf(result.user.id)
    expect(row?.providerId).toBe(APPLE_PROVIDER_ID)
    expect(row?.accountId).toBe('apple.sub.create')
    expect(row?.refreshToken).not.toBe('rt_first')
    expect(await appleRefreshTokenOf(result.user.id)).toBe('rt_first')

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
      tokens({ subject: 'apple.sub.again' }),
    )
    remember(first.user.id)

    const again = await signInWithAppleNative(
      {
        identityToken: await identityToken('apple.sub.again'),
        authorizationCode: 'auth-again',
        fullName: { givenName: null, familyName: null },
      },
      config,
      tokens({ subject: 'apple.sub.again', refresh_token: null }),
    )

    expect(again.user.id).toBe(first.user.id)
    expect(again.user.name).toBe('Ada Lovelace')
    expect(again.user.email).toBe(first.user.email)
    expect(again.session.token).not.toBe(first.session.token)

    expect(await appleRefreshTokenOf(first.user.id)).toBe('rt_first')
  })

  it('links Apple to the existing account that already holds that email', async () => {
    const linkedId = remember(globalThis.crypto.randomUUID())
    await db.insert(user).values({
      id: linkedId,
      name: 'Already Here',
      email: `${linkedId}@example.com`,
      emailVerified: true,
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
      tokens({ subject: 'apple.sub.link', refresh_token: 'rt_link' }),
    )

    expect(result.user.id).toBe(linkedId)
    expect(result.user.name).toBe('Already Here')
    const row = await appleAccountOf(linkedId)
    expect(row?.accountId).toBe('apple.sub.link')
    expect(await appleRefreshTokenOf(linkedId)).toBe('rt_link')
  })

  it('links Apple to the existing account when the token email differs only by case', async () => {
    const linkedId = remember(globalThis.crypto.randomUUID())
    await db.insert(user).values({
      id: linkedId,
      name: 'Already Here',
      email: `${linkedId}@example.com`,
      emailVerified: true,
    })
    const { config, identityToken, tokens } = await fixture()

    const result = await signInWithAppleNative(
      {
        identityToken: await identityToken('apple.sub.case', {
          email: `${linkedId}@Example.COM`,
        }),
        authorizationCode: 'auth-case',
      },
      config,
      tokens({ subject: 'apple.sub.case', refresh_token: 'rt_case' }),
    )

    expect(result.user.id).toBe(linkedId)
    expect(result.user.email).toBe(`${linkedId}@example.com`)
    const row = await appleAccountOf(linkedId)
    expect(row?.accountId).toBe('apple.sub.case')
  })

  it('stores a first-sign-in email in lowercase', async () => {
    const { config, identityToken, tokens } = await fixture()
    const result = await signInWithAppleNative(
      {
        identityToken: await identityToken('apple.sub.case-create', {
          email: 'Create@PrivateRelay.Appleid.com',
        }),
        authorizationCode: 'auth-case-create',
      },
      config,
      tokens({ subject: 'apple.sub.case-create', refresh_token: 'rt_case_create' }),
    )
    remember(result.user.id)

    expect(result.user.email).toBe('create@privaterelay.appleid.com')
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
        tokens({ subject: 'apple.sub.no-email' }),
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
      tokens({ subject: 'apple.sub.credential-email', refresh_token: 'rt_once' }),
    )
    remember(result.user.id)

    expect(result.user.email).toBe('once@privaterelay.appleid.com')
    expect(result.user.name).toBe('Ada Lovelace')
    expect(result.user.emailVerified).toBe(false)
    const row = await appleAccountOf(result.user.id)
    expect(await appleRefreshTokenOf(result.user.id)).toBe('rt_once')
  })

  it('does not attach Apple to an existing user from an unverified token email', async () => {
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
          identityToken: await identityToken('apple.sub.unverified-email', {
            email: `${victimId}@example.com`,
            email_verified: 'false',
          }),
          authorizationCode: 'auth-unverified',
        },
        config,
        tokens({ subject: 'apple.sub.unverified-email' }),
      ),
    ).rejects.toMatchObject({
      name: 'AppleSignInRefused',
      code: EMAIL_ALREADY_ASSOCIATED_CODE,
    })

    expect(await appleAccountOf(victimId)).toBeUndefined()
  })

  it('keeps one Apple account when two first sign-ins race on the same subject', async () => {
    const { config, identityToken, tokens } = await fixture()
    const email = 'race@privaterelay.appleid.com'
    const input = {
      authorizationCode: 'auth-race',
      fullName: { givenName: 'Ada', familyName: 'Lovelace' },
    }

    const [first, second] = await Promise.all([
      signInWithAppleNative(
        {
          ...input,
          identityToken: await identityToken('apple.sub.race', { email }),
        },
        config,
        tokens({ subject: 'apple.sub.race', refresh_token: 'rt_race_a' }),
      ),
      signInWithAppleNative(
        {
          ...input,
          identityToken: await identityToken('apple.sub.race', { email }),
        },
        config,
        tokens({ subject: 'apple.sub.race', refresh_token: 'rt_race_b' }),
      ),
    ])
    remember(first.user.id)
    remember(second.user.id)

    expect(first.user.id).toBe(second.user.id)
    expect(first.session.token).not.toBe(second.session.token)

    const rows = await db.query.account.findMany({
      where: {
        providerId: APPLE_PROVIDER_ID,
        accountId: 'apple.sub.race',
      },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.userId).toBe(first.user.id)
  })

  it('leaves no user when the account insert fails', async () => {
    const email = 'rollback@privaterelay.appleid.com'
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION apple_fail_account_rollback()
      RETURNS trigger LANGUAGE plpgsql AS $apple_fail_account_rollback$
      BEGIN
        IF NEW.account_id = 'apple.sub.rollback' THEN
          RAISE EXCEPTION 'account insert failed';
        END IF;
        RETURN NEW;
      END
      $apple_fail_account_rollback$
    `)
    await db.execute(sql`
      DROP TRIGGER IF EXISTS apple_fail_account_rollback ON "account"
    `)
    await db.execute(sql`
      CREATE TRIGGER apple_fail_account_rollback
      BEFORE INSERT ON "account"
      FOR EACH ROW EXECUTE FUNCTION apple_fail_account_rollback()
    `)

    const { config, identityToken, tokens } = await fixture()
    try {
      await expect(
        signInWithAppleNative(
          {
            identityToken: await identityToken('apple.sub.rollback', { email }),
            authorizationCode: 'auth-rollback',
            fullName: { givenName: 'Ada', familyName: 'Lovelace' },
          },
          config,
          tokens({ subject: 'apple.sub.rollback' }),
        ),
      ).rejects.toThrow()

      expect(
        await db.query.user.findFirst({ where: { email } }),
      ).toBeUndefined()
      expect(
        await db.query.account.findFirst({
          where: {
            providerId: APPLE_PROVIDER_ID,
            accountId: 'apple.sub.rollback',
          },
        }),
      ).toBeUndefined()
    } finally {
      await db.execute(sql`
        DROP TRIGGER IF EXISTS apple_fail_account_rollback ON "account"
      `)
      await db.execute(sql`
        DROP FUNCTION IF EXISTS apple_fail_account_rollback()
      `)
    }
  })

  it('lets a later verified Apple identity take an email a client-supplied sign-in reserved', async () => {
    const { config, identityToken, tokens } = await fixture()
    const email = `${globalThis.crypto.randomUUID()}@example.com`
    const seeded = await signInWithAppleNative(
      {
        identityToken: await identityToken('apple.sub.seed-unverified'),
        authorizationCode: 'auth-seed',
        email,
      },
      config,
      tokens({ subject: 'apple.sub.seed-unverified' }),
    )
    remember(seeded.user.id)

    const stored = await db.query.user.findFirst({
      where: { id: seeded.user.id },
    })
    expect(stored?.emailVerified).toBe(false)

    const later = await signInWithAppleNative(
      {
        identityToken: await identityToken('apple.sub.verified-later', {
          email,
        }),
        authorizationCode: 'auth-later',
      },
      config,
      tokens({ subject: 'apple.sub.verified-later' }),
    )
    remember(later.user.id)

    expect(later.user.id).not.toBe(seeded.user.id)
    expect(later.user.email).toBe(email)
    expect(later.user.emailVerified).toBe(true)

    const seededRow = await db.query.user.findFirst({
      where: { id: seeded.user.id },
    })
    expect(seededRow?.email).toBe(
      unverifiedEmailPlaceholder(seeded.user.id, email),
    )
    expect((await appleAccountOf(seeded.user.id))?.accountId).toBe(
      'apple.sub.seed-unverified',
    )
    expect((await appleAccountOf(later.user.id))?.accountId).toBe(
      'apple.sub.verified-later',
    )
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
        tokens({ subject: 'apple.sub.forged-email' }),
      ),
    ).rejects.toMatchObject({
      name: 'AppleSignInRefused',
      code: EMAIL_ALREADY_ASSOCIATED_CODE,
    })

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

  it('rejects an authorization code whose Apple identity does not match the token', async () => {
    const { config, identityToken, tokens } = await fixture()
    const before = await db.select().from(session)

    await expect(
      signInWithAppleNative(
        {
          identityToken: await identityToken('apple.sub.owner', {
            email: 'owner@privaterelay.appleid.com',
          }),
          authorizationCode: 'auth-other',
        },
        config,
        tokens({ subject: 'apple.sub.other' }),
      ),
    ).rejects.toBeInstanceOf(AppleIdentityInvalid)

    const after = await db.select().from(session)
    expect(after).toHaveLength(before.length)
  })

  it('rejects an exchange that does not return an identity token', async () => {
    const { config, identityToken, tokens } = await fixture()

    await expect(
      signInWithAppleNative(
        {
          identityToken: await identityToken('apple.sub.no-id', {
            email: 'noid@privaterelay.appleid.com',
          }),
          authorizationCode: 'auth-first',
        },
        config,
        tokens({ subject: 'apple.sub.no-id', id_token: null }),
      ),
    ).rejects.toBeInstanceOf(AppleTokenExchangeFailed)
  })
})
