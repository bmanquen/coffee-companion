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
}

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

export function socialSignInFailed(returned: unknown) {
  if (returned == null) return true
  if (isAPIError(returned)) return true
  if (returned instanceof Response) return !returned.ok
  if (typeof returned !== 'object') return true
  if ('token' in returned && typeof returned.token === 'string' && returned.token) {
    return false
  }
  if ('user' in returned && returned.user) return false
  if ('session' in returned && returned.session) return false
  return true
}

export async function restoreReleasedEmailHoldIfSignInFailed(context: object) {
  const hold = releasedEmailHoldOf(context)
  if (!hold) return
  if (!socialSignInFailed((context as HoldContext).returned)) return
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
