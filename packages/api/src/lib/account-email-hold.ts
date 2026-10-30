import { isAPIError } from 'better-auth/api'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { user } from '../db/schema'
import {
  identityFromVerifiedJwt,
  isEmailVerifiedClaim,
  legacyUnverifiedEmailPlaceholder,
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

function addressIsUnowned(email: string) {
  return sql`not exists (select 1 from "user" occupied where occupied.email = ${email})`
}

// Forged tokens hit this path on every failed verify. A hold released
// seconds ago belongs to an in-flight claim, not a crash.
export const ORPHANED_EMAIL_HOLD_STALE_AFTER = '5 minutes'

function holdPlaceholderIsStale() {
  return sql`${user.updatedAt} < now() - ${ORPHANED_EMAIL_HOLD_STALE_AFTER}::interval`
}

export async function takeUnverifiedEmailHold(
  email: string,
  store: EmailHoldStore = db,
): Promise<ReleasedEmailHold | null> {
  const occupant = await store.query.user.findFirst({ where: { email } })
  if (!occupant) return null
  if (occupant.emailVerified) return null
  // Another sign-in can verify this row after the read. The write keeps
  // the hold only if the occupant is still unverified at that address.
  const taken = await store
    .update(user)
    .set({ email: unverifiedEmailPlaceholder(email, occupant.id) })
    .where(
      and(
        eq(user.id, occupant.id),
        eq(user.email, email),
        eq(user.emailVerified, false),
      ),
    )
    .returning({ id: user.id })
  if (!taken[0]) return null
  return { email, userId: occupant.id }
}

export async function restoreUnverifiedEmailHold(
  hold: ReleasedEmailHold,
  store: EmailHoldStore = db,
): Promise<'restored' | 'kept'> {
  const holder = await store.query.user.findFirst({ where: { id: hold.userId } })
  if (!holder) return 'kept'
  if (holder.email === hold.email) return 'restored'
  const placeholder = unverifiedEmailPlaceholder(hold.email, hold.userId)
  if (holder.email !== placeholder) return 'kept'

  const restored = await store
    .update(user)
    .set({ email: hold.email })
    .where(
      and(
        eq(user.id, hold.userId),
        eq(user.email, placeholder),
        eq(user.emailVerified, false),
        addressIsUnowned(hold.email),
      ),
    )
    .returning({ id: user.id })
  return restored[0] ? 'restored' : 'kept'
}

export async function restoreOrphanedEmailHoldIfUnowned(
  email: string,
  store: EmailHoldStore = db,
): Promise<'restored' | 'kept'> {
  // Exact placeholder match uses the email unique index. Fresh rows stay
  // put so a forged token cannot undo an in-flight claim. Per-holder
  // stand-ins are restored by restoreUnverifiedEmailHold, which has the id.
  const restored = await store
    .update(user)
    .set({ email })
    .where(
      and(
        eq(user.email, legacyUnverifiedEmailPlaceholder(email)),
        eq(user.emailVerified, false),
        holdPlaceholderIsStale(),
        addressIsUnowned(email),
      ),
    )
    .returning({ id: user.id })
  return restored[0] ? 'restored' : 'kept'
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

export async function restoreReleasedEmailHoldIfSignInFailed(
  context: object,
  body?: unknown,
) {
  const hold = releasedEmailHoldOf(context)
  const ctx = context as HoldContext
  if (!(await socialSignInFailed(ctx.returned, ctx.responseHeaders))) return
  if (hold) {
    await restoreUnverifiedEmailHold(hold)
    return
  }
  const parsed = socialIdTokenFromBody(body)
  const email = parsed ? identityFromVerifiedJwt(parsed.token)?.email : null
  if (email) await restoreOrphanedEmailHoldIfUnowned(email)
}

export async function releaseUnverifiedEmailFromVerifiedSocial(
  body: unknown,
  providers: Array<SocialProviderVerify>,
): Promise<ReleasedEmailHold | null> {
  const parsed = socialIdTokenFromBody(body)
  if (!parsed) return null
  const provider = providers.find((item) => item.id === parsed.provider)
  if (!provider?.verifyIdToken) return null
  if (!(await provider.verifyIdToken(parsed.token, parsed.nonce))) {
    const identity = identityFromVerifiedJwt(parsed.token)
    // Claims are untrusted here; restore still no-ops unless the address
    // is free and a placeholder encodes it.
    if (identity?.email) await restoreOrphanedEmailHoldIfUnowned(identity.email)
    return null
  }

  const info = await provider.getUserInfo?.({ idToken: parsed.token })
  const fromProvider = info?.user?.email?.trim().toLowerCase()
  const emailVerified = info?.user
    ? isEmailVerifiedClaim(info.user.emailVerified)
    : false
  if (fromProvider && emailVerified) {
    // Do not restore first: this request is about to claim the address.
    return takeUnverifiedEmailHold(fromProvider)
  }

  // verifyIdToken already passed; reading claims is safe. Used when the
  // provider does not expose getUserInfo.
  const identity = identityFromVerifiedJwt(parsed.token)
  if (identity?.emailVerified) return takeUnverifiedEmailHold(identity.email)
  const email = fromProvider ?? identity?.email
  if (email) await restoreOrphanedEmailHoldIfUnowned(email)
  return null
}
