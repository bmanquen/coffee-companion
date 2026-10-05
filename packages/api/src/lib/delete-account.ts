import { and, eq, gt, isNotNull, lte } from 'drizzle-orm'
import { db } from '../db'
import { pendingPersonErasure, session, user, verification } from '../db/schema'
import { ACCOUNT_RESTORE_WINDOW_MS, deletedAtOf } from './account-status'
import { cancelBilledSubscriptions } from './billing'
import { erasePerson } from './erase-person'
import { reportError } from './report-error'

export class SubscriptionCancelFailed extends Error {
  constructor() {
    super(
      'We could not cancel your Subscription, so your account was not deleted. Try again.',
    )
    this.name = 'SubscriptionCancelFailed'
  }
}

export class RestoreWindowClosed extends Error {
  constructor() {
    super('This account can no longer be restored.')
    this.name = 'RestoreWindowClosed'
  }
}

export class AccountNotPending extends Error {
  constructor() {
    super('This account is not waiting to be restored.')
    this.name = 'AccountNotPending'
  }
}

async function rememberFailedPersonErasure(accountId: string) {
  await db
    .insert(pendingPersonErasure)
    .values({ accountId })
    .onConflictDoNothing()
}

async function forgetPersonErasure(accountId: string) {
  await db
    .delete(pendingPersonErasure)
    .where(eq(pendingPersonErasure.accountId, accountId))
}

async function erasePersonAfterRow(userId: string) {
  try {
    await erasePerson(userId)
    await forgetPersonErasure(userId)
  } catch (error) {
    reportError(error, {
      tags: { area: 'account', operation: 'erasePerson' },
      user: { id: userId },
    })
    await rememberFailedPersonErasure(userId)
  }
}

async function hardDeleteAccount(
  userId: string,
  email: string,
  expiredCutoff: Date,
): Promise<boolean> {
  const removed = await db.transaction(async (tx) => {
    const gone = await tx
      .delete(user)
      .where(and(eq(user.id, userId), lte(user.deletedAt, expiredCutoff)))
      .returning({ id: user.id })
    if (gone.length === 0) return false
    await tx.delete(verification).where(eq(verification.identifier, email))
    return true
  })
  if (removed) await erasePersonAfterRow(userId)
  return removed
}

export async function deleteAccount(userId: string, now = new Date()) {
  const row = await db.query.user.findFirst({ where: { id: userId } })
  if (!row) return
  if (row.deletedAt) return

  if (row.stripeCustomerId) {
    try {
      // Also expires open Checkout Sessions — a session paid after this
      // would start a Subscription on a customer we no longer have.
      await cancelBilledSubscriptions(row.stripeCustomerId)
    } catch (error) {
      reportError(error, {
        tags: { area: 'account', operation: 'cancelBilledSubscriptions' },
        user: { id: userId },
      })
      throw new SubscriptionCancelFailed()
    }
  }

  await db.transaction(async (tx) => {
    await tx.update(user).set({ deletedAt: now }).where(eq(user.id, userId))
    await tx.delete(session).where(eq(session.userId, userId))
  })
}

export async function restoreAccount(userId: string, now = new Date()) {
  const stillOpenCutoff = new Date(now.getTime() - ACCOUNT_RESTORE_WINDOW_MS)
  const restored = await db
    .update(user)
    .set({ deletedAt: null })
    .where(and(eq(user.id, userId), gt(user.deletedAt, stillOpenCutoff)))
    .returning({ id: user.id })
  if (restored.length > 0) return

  const deletedAt = await deletedAtOf(userId)
  if (!deletedAt) throw new AccountNotPending()
  throw new RestoreWindowClosed()
}

export async function purgeExpiredDeletedAccounts(now = new Date()) {
  const pending = await db
    .select({ accountId: pendingPersonErasure.accountId })
    .from(pendingPersonErasure)
  for (const row of pending) {
    await erasePersonAfterRow(row.accountId)
  }

  const expiredCutoff = new Date(now.getTime() - ACCOUNT_RESTORE_WINDOW_MS)
  const rows = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(and(isNotNull(user.deletedAt), lte(user.deletedAt, expiredCutoff)))

  let purged = 0
  for (const row of rows) {
    if (await hardDeleteAccount(row.id, row.email, expiredCutoff)) purged += 1
  }

  return { purged }
}
