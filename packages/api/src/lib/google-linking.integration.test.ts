import { afterAll, describe, expect, it } from 'vitest'
import { handleOAuthUserInfo } from 'better-auth/oauth2'
import { inArray } from 'drizzle-orm'
import { SignJWT, exportJWK, exportPKCS8, generateKeyPair } from 'jose'
import { db } from '../db'
import { user } from '../db/schema'
import { unverifiedEmailPlaceholder } from './account-email'
import {
  releaseUnverifiedEmailFromVerifiedSocial,
  releaseUnverifiedEmailHold,
  restoreUnverifiedEmailHold,
} from './account-email-hold'
import {
  APPLE_ISSUER,
  appleAccountOf,
  appleLocalJwks,
  signInWithAppleNative,
} from './apple'
import { auth } from './auth'
import type { AppleCrypto, AppleNativeConfig } from './apple'

const BUNDLE_ID = 'dev.offbyonelabs.coffeecompanion'
const KEY_ID = 'GOOGLKEY1'
const TEAM_ID = 'TEAMGOOG01'
const createdUserIds: Array<string> = []

afterAll(async () => {
  if (createdUserIds.length) {
    await db.delete(user).where(inArray(user.id, createdUserIds))
  }
  await db.$client.end()
})

function remember(id: string) {
  createdUserIds.push(id)
  return id
}

async function appleFixture() {
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

  const identityToken = (subject: string, claims: Record<string, unknown> = {}) =>
    new SignJWT({
      email_verified: 'true',
      ...claims,
    })
      .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
      .setIssuer(APPLE_ISSUER)
      .setAudience(BUNDLE_ID)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(pair.privateKey)

  const tokens = (subject: string, refreshToken = 'rt_apple'): AppleCrypto => ({
    verifyKey: appleLocalJwks([jwk]),
    fetch: async () =>
      Response.json({
        refresh_token: refreshToken,
        access_token: 'at_1',
        id_token: await identityToken(subject),
      }),
  })

  return { config, identityToken, tokens }
}

async function signInGoogle(email: string, accountId: string) {
  const context = await auth.$context
  return handleOAuthUserInfo({ context } as unknown as Parameters<
    typeof handleOAuthUserInfo
  >[0], {
    userInfo: {
      id: accountId,
      email,
      emailVerified: true,
      name: 'Google User',
    },
    account: {
      providerId: 'google',
      accountId,
    },
  })
}

async function withGoogleSocial(
  methods: {
    verifyIdToken: (token: string, nonce?: string) => Promise<boolean>
    getUserInfo: (token: { idToken: string }) => Promise<{
      user?: {
        id?: string
        email?: string | null
        emailVerified?: boolean | string
        name?: string
      }
    } | null>
  },
  run: () => Promise<void>,
) {
  const ctx = await auth.$context
  const providers = ctx.socialProviders as Array<{
    id: string
    verifyIdToken?: typeof methods.verifyIdToken
    getUserInfo?: typeof methods.getUserInfo
  }>
  const google = providers.find((item) => item.id === 'google')
  if (google) {
    const saved = {
      verifyIdToken: google.verifyIdToken,
      getUserInfo: google.getUserInfo,
    }
    google.verifyIdToken = methods.verifyIdToken
    google.getUserInfo = methods.getUserInfo
    try {
      await run()
    } finally {
      google.verifyIdToken = saved.verifyIdToken
      google.getUserInfo = saved.getUserInfo
    }
    return
  }
  providers.push({ id: 'google', ...methods })
  try {
    await run()
  } finally {
    const index = providers.findIndex((item) => item.id === 'google')
    if (index >= 0) providers.splice(index, 1)
  }
}

async function postSocialSignIn(email: string) {
  return auth.handler(
    new Request(`${baseURL}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'coffeecompanion://',
      },
      body: JSON.stringify({
        provider: 'google',
        idToken: { token: jwtWithEmail(email) },
      }),
    }),
  )
}

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'

function jwtWithEmail(email: string) {
  const payload = Buffer.from(JSON.stringify({ email })).toString('base64url')
  return `header.${payload}.sig`
}

describe('Google account linking', () => {
  it('leaves an unverified Apple email hold intact when the social id token is forged', async () => {
    const { config, identityToken, tokens } = await appleFixture()
    const email = `${globalThis.crypto.randomUUID()}@example.com`
    const apple = await signInWithAppleNative(
      {
        identityToken: await identityToken('apple.sub.google-hook'),
        authorizationCode: 'auth-apple',
        email,
      },
      config,
      tokens('apple.sub.google-hook'),
    )
    remember(apple.user.id)

    await auth.handler(
      new Request(`${baseURL}/api/auth/sign-in/social`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'coffeecompanion://',
        },
        body: JSON.stringify({
          provider: 'google',
          idToken: { token: jwtWithEmail(email) },
        }),
      }),
    )

    const stored = await db.query.user.findFirst({
      where: { id: apple.user.id },
    })
    expect(stored?.email).toBe(email)
    expect(stored?.email).not.toBe(unverifiedEmailPlaceholder(apple.user.id))
  })

  it('releases an unverified hold only after the provider verifies the id token', async () => {
    const { config, identityToken, tokens } = await appleFixture()
    const email = `${globalThis.crypto.randomUUID()}@example.com`
    const apple = await signInWithAppleNative(
      {
        identityToken: await identityToken('apple.sub.google-verified-hook'),
        authorizationCode: 'auth-apple',
        email,
      },
      config,
      tokens('apple.sub.google-verified-hook'),
    )
    remember(apple.user.id)

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
    )

    const stored = await db.query.user.findFirst({
      where: { id: apple.user.id },
    })
    expect(stored?.email).toBe(unverifiedEmailPlaceholder(apple.user.id))
  })

  it('leaves the hold intact when a verified token does not claim a verified email', async () => {
    const { config, identityToken, tokens } = await appleFixture()
    const email = `${globalThis.crypto.randomUUID()}@example.com`
    const apple = await signInWithAppleNative(
      {
        identityToken: await identityToken('apple.sub.google-unverified-claim'),
        authorizationCode: 'auth-apple',
        email,
      },
      config,
      tokens('apple.sub.google-unverified-claim'),
    )
    remember(apple.user.id)

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
            user: { email, emailVerified: false },
          }),
        },
      ],
    )

    const stored = await db.query.user.findFirst({
      where: { id: apple.user.id },
    })
    expect(stored?.email).toBe(email)
  })

  it('does not join a Google sign-in to an Apple user whose email was only client-supplied', async () => {
    const { config, identityToken, tokens } = await appleFixture()
    const email = `${globalThis.crypto.randomUUID()}@example.com`
    const apple = await signInWithAppleNative(
      {
        identityToken: await identityToken('apple.sub.google-no-join'),
        authorizationCode: 'auth-apple',
        email,
      },
      config,
      tokens('apple.sub.google-no-join'),
    )
    remember(apple.user.id)

    const google = await signInGoogle(email, 'google.sub.no-join')
    if (google.data) remember(google.data.user.id)

    expect(google.error).toBe('account not linked')
    expect(google.data).toBeNull()
    expect(
      await db.query.account.findFirst({
        where: { providerId: 'google', accountId: 'google.sub.no-join' },
      }),
    ).toBeUndefined()
    expect((await appleAccountOf(apple.user.id))?.accountId).toBe(
      'apple.sub.google-no-join',
    )
    const stored = await db.query.user.findFirst({
      where: { id: apple.user.id },
    })
    expect(stored?.email).toBe(email)
    expect(stored?.emailVerified).toBe(false)
  })

  it('lets a later verified Google sign-in take an email a client-supplied Apple sign-in reserved', async () => {
    const { config, identityToken, tokens } = await appleFixture()
    const email = `${globalThis.crypto.randomUUID()}@example.com`
    const apple = await signInWithAppleNative(
      {
        identityToken: await identityToken('apple.sub.google-claim'),
        authorizationCode: 'auth-apple',
        email,
      },
      config,
      tokens('apple.sub.google-claim'),
    )
    remember(apple.user.id)

    expect(await releaseUnverifiedEmailHold(email)).toBe('released')

    const google = await signInGoogle(email, 'google.sub.claim')
    expect(google.error).toBeNull()
    expect(google.data?.user.id).not.toBe(apple.user.id)
    expect(google.data?.user.email).toBe(email)
    expect(google.data?.user.emailVerified).toBe(true)
    if (google.data) remember(google.data.user.id)

    const appleRow = await db.query.user.findFirst({
      where: { id: apple.user.id },
    })
    expect(appleRow?.email).toBe(unverifiedEmailPlaceholder(apple.user.id))
    expect((await appleAccountOf(apple.user.id))?.accountId).toBe(
      'apple.sub.google-claim',
    )
    expect(
      await db.query.account.findFirst({
        where: { userId: apple.user.id, providerId: 'google' },
      }),
    ).toBeUndefined()
  })

  it('restores the hold when a verified token is followed by a sign-in failure', async () => {
    const { config, identityToken, tokens } = await appleFixture()
    const email = `${globalThis.crypto.randomUUID()}@example.com`
    const apple = await signInWithAppleNative(
      {
        identityToken: await identityToken('apple.sub.google-restore'),
        authorizationCode: 'auth-apple',
        email,
      },
      config,
      tokens('apple.sub.google-restore'),
    )
    remember(apple.user.id)

    let infoCalls = 0
    await withGoogleSocial(
      {
        verifyIdToken: async () => true,
        getUserInfo: async () => {
          infoCalls += 1
          if (infoCalls === 1) {
            return { user: { email, emailVerified: true, name: 'Google User' } }
          }
          return null
        },
      },
      async () => {
        const response = await postSocialSignIn(email)
        expect(response.ok).toBe(false)
      },
    )

    const stored = await db.query.user.findFirst({
      where: { id: apple.user.id },
    })
    expect(stored?.email).toBe(email)
    expect(stored?.email).not.toBe(unverifiedEmailPlaceholder(apple.user.id))
  })

  it('leaves the hold released when sign-in succeeds', async () => {
    const { config, identityToken, tokens } = await appleFixture()
    const email = `${globalThis.crypto.randomUUID()}@example.com`
    const accountId = `google.sub.keep-released.${globalThis.crypto.randomUUID()}`
    const apple = await signInWithAppleNative(
      {
        identityToken: await identityToken('apple.sub.google-keep-released'),
        authorizationCode: 'auth-apple',
        email,
      },
      config,
      tokens('apple.sub.google-keep-released'),
    )
    remember(apple.user.id)

    await withGoogleSocial(
      {
        verifyIdToken: async () => true,
        getUserInfo: async () => ({
          user: {
            id: accountId,
            email,
            emailVerified: true,
            name: 'Google User',
          },
        }),
      },
      async () => {
        const response = await postSocialSignIn(email)
        expect(response.ok).toBe(true)
        const body = (await response.json()) as { user?: { id?: string } }
        if (body.user?.id) remember(body.user.id)
      },
    )

    const appleRow = await db.query.user.findFirst({
      where: { id: apple.user.id },
    })
    expect(appleRow?.email).toBe(unverifiedEmailPlaceholder(apple.user.id))
    const claimant = await db.query.user.findFirst({ where: { email } })
    expect(claimant?.id).not.toBe(apple.user.id)
    expect(claimant?.emailVerified).toBe(true)
    if (claimant) remember(claimant.id)
  })

  it('restore is a no-op when the hold is already back or the address is taken', async () => {
    const { config, identityToken, tokens } = await appleFixture()
    const email = `${globalThis.crypto.randomUUID()}@example.com`
    const apple = await signInWithAppleNative(
      {
        identityToken: await identityToken('apple.sub.google-restore-idempotent'),
        authorizationCode: 'auth-apple',
        email,
      },
      config,
      tokens('apple.sub.google-restore-idempotent'),
    )
    remember(apple.user.id)

    const hold = { email, userId: apple.user.id }
    expect(await restoreUnverifiedEmailHold(hold)).toBe('restored')
    expect(await restoreUnverifiedEmailHold(hold)).toBe('restored')
    expect(
      (await db.query.user.findFirst({ where: { id: apple.user.id } }))?.email,
    ).toBe(email)

    expect(await releaseUnverifiedEmailHold(email)).toBe('released')
    const otherId = remember(globalThis.crypto.randomUUID())
    await db.insert(user).values({
      id: otherId,
      name: 'Taken',
      email,
      emailVerified: true,
    })
    expect(await restoreUnverifiedEmailHold(hold)).toBe('kept')
    expect(
      (await db.query.user.findFirst({ where: { id: apple.user.id } }))?.email,
    ).toBe(unverifiedEmailPlaceholder(apple.user.id))
  })
})
