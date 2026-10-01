import { eq } from 'drizzle-orm'
import { db } from '../db'
import { user, verification } from '../db/schema'
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

export async function deleteAccount(userId: string) {
  const row = await db.query.user.findFirst({ where: { id: userId } })
  if (!row) return

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
    await tx.delete(verification).where(eq(verification.identifier, row.email))
    await tx.delete(user).where(eq(user.id, userId))
  })

  try {
    await erasePerson(userId)
  } catch (error) {
    reportError(error, {
      tags: { area: 'account', operation: 'erasePerson' },
      user: { id: userId },
    })
  }
}
