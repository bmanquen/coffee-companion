import { isAPIError } from 'better-auth/api'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { user } from '../db/schema'
import {
  identityFromVerifiedJwt,
  isEmailVerifiedClaim,
  socialIdTokenFromBody,
  unverifiedEmailPlaceholder,
} from './account-email'
import type { EmailHold } from './account-email'

// A client-supplied Apple email can occupy an address nobody has verified.
// Moving that hold to a unique placeholder lets a later verified claimant
// (Google, or Apple with a verified token email) take the address instead of
// being refused — without joining the two users.
type EmailHoldStore = Pick<typeof db, 'query' | 'update'>

export type SocialProviderVerify = {
  id: string
  verifyIdToken?: (token: string, nonce?: string) => Promise<boolean>
  getUserInfo?: (token: { idToken: string }) => Promise<{
    user?: { email?: string | null; emailVerified?: boolean | string }
  } | null>
}

export type ReleasedEmailHold = {
  email: string
  userId: string
}

export const RELEASED_EMAIL_HOLD = Symbol.for(
  'coffee-companion.released-email-hold',
)

type HoldContext = {
  [RELEASED_EMAIL_HOLD]?: ReleasedEmailHold
  returned?: unknown
  responseHeaders?: Headers
}

// better-auth 1.6.26 /sign-in/social writes this cookie (optionally
// `__Secure-` prefixed) and returns the session token in the JSON body.
const SESSION_TOKEN_COOKIE = 'session_token'

export function rememberReleasedEmailHold(
  context: object,
  hold: ReleasedEmailHold | null | undefined,
) {
  if (!hold) return
  ;(context as HoldContext)[RELEASED_EMAIL_HOLD] = hold
}

export function releasedEmailHoldOf(context: object) {
  return (context as HoldContext)[RELEASED_EMAIL_HOLD]
}

export async function releaseUnverifiedEmailHold(
  email: string,
  store: EmailHoldStore = db,
): Promise<EmailHold> {
  const taken = await takeUnverifiedEmailHold(email, store)
  if (taken) return 'released'
  const occupant = await store.query.user.findFirst({ where: { email } })
  if (!occupant) return 'free'
  return occupant.emailVerified ? 'verified' : 'free'
}

export async function takeUnverifiedEmailHold(
  email: string,
  store: EmailHoldStore = db,
): Promise<ReleasedEmailHold | null> {
  const occupant = await store.query.user.findFirst({ where: { email } })
  if (!occupant) return null
  if (occupant.emailVerified) return null
  await store
    .update(user)
    .set({ email: unverifiedEmailPlaceholder(occupant.id) })
    .where(eq(user.id, occupant.id))
  return { email, userId: occupant.id }
}

export async function restoreUnverifiedEmailHold(
  hold: ReleasedEmailHold,
  store: EmailHoldStore = db,
): Promise<'restored' | 'kept'> {
  const holder = await store.query.user.findFirst({ where: { id: hold.userId } })
  if (!holder) return 'kept'
  if (holder.email === hold.email) return 'restored'
  if (holder.email !== unverifiedEmailPlaceholder(hold.userId)) return 'kept'

  const taken = await store.query.user.findFirst({ where: { email: hold.email } })
  if (taken && taken.id !== hold.userId) return 'kept'

  await store
    .update(user)
    .set({ email: hold.email })
    .where(eq(user.id, hold.userId))
  return 'restored'
}

function sessionTokenFromBody(body: object) {
  if ('token' in body && typeof body.token === 'string' && body.token) {
    return true
  }
  if (!('session' in body) || body.session == null || typeof body.session !== 'object') {
    return false
  }
  const session = body.session as { token?: unknown }
  return typeof session.token === 'string' && Boolean(session.token)
}

function headersHaveSessionCookie(headers: Headers) {
  const lines =
    typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []
  return lines.some((line) =>
    line.split('=', 1)[0].trim().endsWith(SESSION_TOKEN_COOKIE),
  )
}

export async function socialSignInFailed(
  returned: unknown,
  headers?: Headers,
) {
  if (returned == null) return true
  if (isAPIError(returned)) return true
  if (headers && headersHaveSessionCookie(headers)) return false
  if (returned instanceof Response) {
    if (headersHaveSessionCookie(returned.headers)) return false
    try {
      const body: unknown = await returned.clone().json()
      if (body && typeof body === 'object' && sessionTokenFromBody(body)) {
        return false
      }
    } catch {
      return true
    }
    return true
  }
  if (typeof returned !== 'object') return true
  return !sessionTokenFromBody(returned)
}

export async function restoreReleasedEmailHoldIfSignInFailed(context: object) {
  const hold = releasedEmailHoldOf(context)
  if (!hold) return
  const ctx = context as HoldContext
  if (!(await socialSignInFailed(ctx.returned, ctx.responseHeaders))) return
  await restoreUnverifiedEmailHold(hold)
}

export async function releaseUnverifiedEmailFromVerifiedSocial(
  body: unknown,
  providers: Array<SocialProviderVerify>,
): Promise<ReleasedEmailHold | null> {
  const parsed = socialIdTokenFromBody(body)
  if (!parsed) return null
  const provider = providers.find((item) => item.id === parsed.provider)
  if (!provider?.verifyIdToken) return null
  if (!(await provider.verifyIdToken(parsed.token, parsed.nonce))) return null

  const info = await provider.getUserInfo?.({ idToken: parsed.token })
  const fromProvider = info?.user?.email?.trim().toLowerCase()
  const emailVerified = info?.user
    ? isEmailVerifiedClaim(info.user.emailVerified)
    : false
  if (fromProvider && emailVerified) {
    return takeUnverifiedEmailHold(fromProvider)
  }

  // verifyIdToken already passed; reading claims is safe. Used when the
  // provider does not expose getUserInfo.
  const identity = identityFromVerifiedJwt(parsed.token)
  if (identity?.emailVerified) return takeUnverifiedEmailHold(identity.email)
  return null
}
