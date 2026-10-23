import { eq } from 'drizzle-orm'
import { db } from '../db'
import { user } from '../db/schema'
import {
  emailFromSocialIdToken,
  unverifiedEmailPlaceholder,
} from './account-email'
import type { EmailHold } from './account-email'

// A client-supplied Apple email can occupy an address nobody has verified.
// Moving that hold to a unique placeholder lets a later verified claimant
// (Google, or Apple with a verified token email) take the address instead of
// being refused — without joining the two users.
type EmailHoldStore = Pick<typeof db, 'query' | 'update'>

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

export async function releaseUnverifiedEmailFromSocialBody(body: unknown) {
  const email = emailFromSocialIdToken(body)
  if (email) await releaseUnverifiedEmailHold(email)
}
