import { eq } from 'drizzle-orm'
import { db } from '../db'
import { user } from '../db/schema'
import {
  
  identityFromVerifiedJwt,
  socialIdTokenFromBody,
  unverifiedEmailPlaceholder
} from './account-email'
import type {EmailHold} from './account-email';

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

export async function releaseUnverifiedEmailHold(
  email: string,
  store: EmailHoldStore = db,
): Promise<EmailHold> {
  const occupant = await store.query.user.findFirst({ where: { email } })
  if (!occupant) return 'free'
  if (occupant.emailVerified) return 'verified'
  await store
    .update(user)
    .set({ email: unverifiedEmailPlaceholder(occupant.id) })
    .where(eq(user.id, occupant.id))
  return 'released'
}

export async function releaseUnverifiedEmailFromVerifiedSocial(
  body: unknown,
  providers: Array<SocialProviderVerify>,
) {
  const parsed = socialIdTokenFromBody(body)
  if (!parsed) return
  const provider = providers.find((item) => item.id === parsed.provider)
  if (!provider?.verifyIdToken) return
  if (!(await provider.verifyIdToken(parsed.token, parsed.nonce))) return

  const info = await provider.getUserInfo?.({ idToken: parsed.token })
  const fromProvider = info?.user?.email?.trim().toLowerCase()
  const emailVerified = info?.user
    ? info.user.emailVerified === true || info.user.emailVerified === 'true'
    : false
  if (fromProvider && emailVerified) {
    await releaseUnverifiedEmailHold(fromProvider)
    return
  }

  // verifyIdToken already passed; reading claims is safe. Used when the
  // provider does not expose getUserInfo.
  const identity = identityFromVerifiedJwt(parsed.token)
  if (identity?.emailVerified) await releaseUnverifiedEmailHold(identity.email)
}
