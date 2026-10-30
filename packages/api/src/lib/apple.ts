import {
  SignJWT,
  createLocalJWKSet,
  createRemoteJWKSet,
  importPKCS8,
  jwtVerify,
} from 'jose'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { account, session, user } from '../db/schema'
import {
  EMAIL_ALREADY_ASSOCIATED,
  EMAIL_ALREADY_ASSOCIATED_CODE,
  emailIsUnverifiedHolderAddress,
} from './account-email'
import {
  releaseUnverifiedEmailHold,
  restoreOrphanedEmailHoldIfUnowned,
} from './account-email-hold'
import {
  decryptStoredOAuthToken,
  encryptStoredOAuthToken,
} from './oauth-token'
import { PG_UNIQUE_VIOLATION, pgErrorIn } from './pg-error'
import type { JWK, JWTPayload, JWTVerifyGetKey } from 'jose'

export const APPLE_ISSUER = 'https://appleid.apple.com'
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys'
export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token'
export const APPLE_PROVIDER_ID = 'apple'
export const APPLE_AUTHORIZATION_CODE_GRANT = 'authorization_code'
export const APPLE_CLIENT_SECRET_TTL_SECONDS = 180 * 24 * 60 * 60
export const APPLE_SESSION_MS = 7 * 24 * 60 * 60 * 1000
export const APPLE_FALLBACK_NAME = 'Apple user'
export const APPLE_SIGN_IN_ATTEMPTS = 2

const APPLE_SIGNING_ALG = 'ES256'
const EMAIL_VERIFIED_TRUE = 'true'

export class AppleIdentityInvalid extends Error {
  constructor(message = 'Apple identity token is not valid.') {
    super(message)
    this.name = 'AppleIdentityInvalid'
  }
}

export class AppleTokenExchangeFailed extends Error {
  constructor(message = 'Apple did not accept the authorization code.') {
    super(message)
    this.name = 'AppleTokenExchangeFailed'
  }
}

export class AppleNotConfigured extends Error {
  constructor(missing: ReadonlyArray<string> = []) {
    super(
      missing.length
        ? [
            'Apple Sign In is configured, but not completely:',
            ...missing.map((name) => `  - ${name} is not set (apps/web/.env)`),
            'Unset APPLE_BUNDLE_ID to run without it.',
          ].join('\n')
        : 'Apple Sign In is configured, but not completely. Unset APPLE_BUNDLE_ID to run without it.',
    )
    this.name = 'AppleNotConfigured'
  }
}

export class AppleSignInRefused extends Error {
  readonly code: string
  constructor(message: string, code = 'APPLE_SIGN_IN_REFUSED') {
    super(message)
    this.name = 'AppleSignInRefused'
    this.code = code
  }
}

export interface AppleNativeConfig {
  bundleId: string
  teamId: string
  keyId: string
  privateKey: string
}

export interface AppleIdentity {
  subject: string
  email: string | null
  emailVerified: boolean
}

export interface AppleTokenSet {
  refreshToken: string | null
  accessToken: string | null
  idToken: string | null
}

export interface AppleFullName {
  givenName?: string | null
  familyName?: string | null
}

export interface AppleNativeSignInInput {
  identityToken: string
  authorizationCode: string
  fullName?: AppleFullName | null
  email?: string | null
}

export interface AppleNativeSession {
  user: { id: string; name: string; email: string; emailVerified: boolean }
  session: { id: string; token: string; expiresAt: Date }
}

export interface AppleCrypto {
  verifyKey: JWTVerifyGetKey
  now?: () => number
  fetch?: typeof fetch
}

const appleJwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL))

const configVars = [
  'APPLE_BUNDLE_ID',
  'APPLE_TEAM_ID',
  'APPLE_KEY_ID',
  'APPLE_PRIVATE_KEY',
] as const

export function appleNativeConfig(): AppleNativeConfig | null {
  const bundleId = process.env.APPLE_BUNDLE_ID
  // Whitespace-only must match the checker's isSet() so leftover blanks do not enable Apple.
  if (!bundleId?.trim()) return null

  const missing = configVars.filter((name) => !process.env[name]?.trim())
  if (missing.length) {
    throw new AppleNotConfigured(missing)
  }

  return {
    bundleId,
    teamId: process.env.APPLE_TEAM_ID as string,
    keyId: process.env.APPLE_KEY_ID as string,
    privateKey: process.env.APPLE_PRIVATE_KEY as string,
  }
}

export function appleLocalJwks(keys: Array<JWK>) {
  return createLocalJWKSet({ keys })
}

export async function verifyAppleIdentityToken(
  identityToken: string,
  audience: string,
  deps: AppleCrypto = { verifyKey: appleJwks },
): Promise<AppleIdentity> {
  let payload: JWTPayload
  try {
    const verified = await jwtVerify(identityToken, deps.verifyKey, {
      issuer: APPLE_ISSUER,
      audience,
      currentDate: deps.now ? new Date(deps.now()) : undefined,
    })
    payload = verified.payload
  } catch {
    throw new AppleIdentityInvalid()
  }

  const subject = payload.sub
  if (!subject) throw new AppleIdentityInvalid()

  const email = typeof payload.email === 'string' ? payload.email : null
  const emailVerified =
    payload.email_verified === true ||
    payload.email_verified === EMAIL_VERIFIED_TRUE

  return { subject, email, emailVerified }
}

export async function appleClientSecret(
  config: AppleNativeConfig,
  now = Date.now,
): Promise<string> {
  const key = await importPKCS8(config.privateKey, APPLE_SIGNING_ALG)
  const issuedAt = Math.floor(now() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: APPLE_SIGNING_ALG, kid: config.keyId })
    .setIssuer(config.teamId)
    .setSubject(config.bundleId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + APPLE_CLIENT_SECRET_TTL_SECONDS)
    .sign(key)
}

export async function exchangeAppleAuthorizationCode(
  authorizationCode: string,
  config: AppleNativeConfig,
  deps: AppleCrypto = { verifyKey: appleJwks },
): Promise<AppleTokenSet> {
  const clientSecret = await appleClientSecret(config, deps.now ?? Date.now)
  const request = deps.fetch ?? fetch
  const body = new URLSearchParams({
    client_id: config.bundleId,
    client_secret: clientSecret,
    code: authorizationCode,
    grant_type: APPLE_AUTHORIZATION_CODE_GRANT,
  })

  let response: Response
  try {
    response = await request(APPLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
  } catch {
    throw new AppleTokenExchangeFailed()
  }

  if (!response.ok) throw new AppleTokenExchangeFailed()

  const json: unknown = await response.json()
  if (!json || typeof json !== 'object') throw new AppleTokenExchangeFailed()
  const token = json as {
    refresh_token?: unknown
    access_token?: unknown
    id_token?: unknown
  }

  return {
    refreshToken:
      typeof token.refresh_token === 'string' ? token.refresh_token : null,
    accessToken:
      typeof token.access_token === 'string' ? token.access_token : null,
    idToken: typeof token.id_token === 'string' ? token.id_token : null,
  }
}

function displayName(
  fullName: AppleFullName | null | undefined,
  email: string | null,
): string {
  const parts = [fullName?.givenName, fullName?.familyName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
  if (parts.length) return parts.join(' ')
  const local = email?.split('@')[0]?.trim()
  return local || APPLE_FALLBACK_NAME
}

export async function signInWithAppleNative(
  input: AppleNativeSignInInput,
  config: AppleNativeConfig,
  deps: AppleCrypto = { verifyKey: appleJwks },
): Promise<AppleNativeSession> {
  const identity = await verifyAppleIdentityToken(
    input.identityToken,
    config.bundleId,
    deps,
  )
  const tokens = await exchangeAppleAuthorizationCode(
    input.authorizationCode,
    config,
    deps,
  )
  if (!tokens.idToken) throw new AppleTokenExchangeFailed()
  const exchanged = await verifyAppleIdentityToken(
    tokens.idToken,
    config.bundleId,
    deps,
  )
  if (exchanged.subject !== identity.subject) {
    throw new AppleIdentityInvalid()
  }

  const tokenEmail = identity.email?.trim().toLowerCase() || null
  const clientEmail = input.email?.trim().toLowerCase() || null
  const name = displayName(input.fullName, tokenEmail ?? clientEmail)

  let lastErr: unknown
  for (let attempt = 0; attempt < APPLE_SIGN_IN_ATTEMPTS; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const existingAccount = await tx.query.account.findFirst({
          where: {
            providerId: APPLE_PROVIDER_ID,
            accountId: identity.subject,
          },
        })

        let userId: string
        if (existingAccount) {
          userId = existingAccount.userId
          const current = await tx.query.user.findFirst({
            where: { id: userId },
          })
          if (!current) {
            throw new AppleSignInRefused('This Apple account is gone.')
          }

          const updates: {
            refreshToken?: string
            accessToken?: string
            idToken?: string
          } = {}
          if (tokens.refreshToken) {
            updates.refreshToken = await encryptStoredOAuthToken(
              tokens.refreshToken,
            )
          }
          if (tokens.accessToken) {
            updates.accessToken = await encryptStoredOAuthToken(
              tokens.accessToken,
            )
          }
          if (tokens.idToken) {
            updates.idToken = await encryptStoredOAuthToken(tokens.idToken)
          }
          if (Object.keys(updates).length) {
            await tx
              .update(account)
              .set(updates)
              .where(eq(account.id, existingAccount.id))
          }
        } else {
          // Only a verified token email may attach this Apple subject to an
          // existing user whose stored email is already verified. A
          // client-supplied address is stored on a new user (Apple sends
          // email once, sometimes only in the credential).
          const tokenVerified = Boolean(identity.emailVerified && tokenEmail)
          const already =
            identity.emailVerified && tokenEmail
              ? await tx.query.user.findFirst({
                  where: { email: tokenEmail, emailVerified: true },
                })
              : undefined

          if (already) {
            userId = already.id
          } else {
            const email = tokenEmail ?? clientEmail
            if (!email) {
              throw new AppleSignInRefused(
                'Apple did not send an email. Sign in again and share your email.',
              )
            }
            if (emailIsUnverifiedHolderAddress(email)) {
              throw new AppleSignInRefused(
                EMAIL_ALREADY_ASSOCIATED,
                EMAIL_ALREADY_ASSOCIATED_CODE,
              )
            }

            if (tokenVerified) {
              const hold = await releaseUnverifiedEmailHold(email, tx)
              if (hold === 'verified') {
                const holder = await tx.query.user.findFirst({
                  where: { email, emailVerified: true },
                })
                if (!holder) {
                  throw new AppleSignInRefused(
                    EMAIL_ALREADY_ASSOCIATED,
                    EMAIL_ALREADY_ASSOCIATED_CODE,
                  )
                }
                userId = holder.id
              } else {
                userId = globalThis.crypto.randomUUID()
                await tx.insert(user).values({
                  id: userId,
                  name,
                  email,
                  emailVerified: true,
                })
              }
            } else {
              // An unverified retry is not a claim. Put a crashed hold
              // back so this client email collides with its owner.
              await restoreOrphanedEmailHoldIfUnowned(email, tx)
              const collision = await tx.query.user.findFirst({
                where: { email },
              })
              if (collision) {
                throw new AppleSignInRefused(
                  EMAIL_ALREADY_ASSOCIATED,
                  EMAIL_ALREADY_ASSOCIATED_CODE,
                )
              }

              userId = globalThis.crypto.randomUUID()
              await tx.insert(user).values({
                id: userId,
                name,
                email,
                emailVerified: false,
              })
            }
          }

          await tx.insert(account).values({
            id: globalThis.crypto.randomUUID(),
            accountId: identity.subject,
            providerId: APPLE_PROVIDER_ID,
            userId,
            accessToken: await encryptStoredOAuthToken(tokens.accessToken),
            refreshToken: await encryptStoredOAuthToken(tokens.refreshToken),
            idToken: await encryptStoredOAuthToken(
              tokens.idToken ?? input.identityToken,
            ),
          })
        }

        const row = await tx.query.user.findFirst({ where: { id: userId } })
        if (!row) throw new AppleSignInRefused('This Apple account is gone.')

        const created = {
          id: globalThis.crypto.randomUUID(),
          token: Buffer.from(
            globalThis.crypto.getRandomValues(new Uint8Array(32)),
          ).toString('hex'),
          userId,
          expiresAt: new Date(
            (deps.now ? deps.now() : Date.now()) + APPLE_SESSION_MS,
          ),
        }
        await tx.insert(session).values(created)

        return {
          user: {
            id: row.id,
            name: row.name,
            email: row.email,
            emailVerified: row.emailVerified,
          },
          session: created,
        }
      })
    } catch (err) {
      lastErr = err
      if (err instanceof AppleSignInRefused) throw err
      if (!pgErrorIn(err, PG_UNIQUE_VIOLATION)) throw err
    }
  }
  throw lastErr
}

export function appleAccountOf(userId: string) {
  return db.query.account.findFirst({
    where: { userId, providerId: APPLE_PROVIDER_ID },
  })
}

export async function appleRefreshTokenOf(userId: string) {
  const row = await appleAccountOf(userId)
  return decryptStoredOAuthToken(row?.refreshToken)
}
