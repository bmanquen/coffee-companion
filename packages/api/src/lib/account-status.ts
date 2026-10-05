import { db } from '../db'

export const ACCOUNT_RESTORE_WINDOW_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000
export const ACCOUNT_RESTORE_WINDOW_MS =
  ACCOUNT_RESTORE_WINDOW_DAYS * MS_PER_DAY

export const ACCOUNT_PENDING_DELETION =
  'This account is deleted and can be restored for 30 days.'

export function restoreDeadline(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + ACCOUNT_RESTORE_WINDOW_MS)
}

export function isRestoreOpen(deletedAt: Date, now = new Date()): boolean {
  return now.getTime() < restoreDeadline(deletedAt).getTime()
}

export async function deletedAtOf(userId: string): Promise<Date | null> {
  const row = await db.query.user.findFirst({
    where: { id: userId },
    columns: { deletedAt: true },
  })
  return row?.deletedAt ?? null
}
