import { db } from '../db'
import {
  ACCOUNT_RESTORE_WINDOW_DAYS,
  ACCOUNT_RESTORE_WINDOW_MS,
  isRestoreOpen,
  restoreDeadline,
} from './account-restore-window'

export {
  ACCOUNT_RESTORE_WINDOW_DAYS,
  ACCOUNT_RESTORE_WINDOW_MS,
  isRestoreOpen,
  restoreDeadline,
}

export const ACCOUNT_PENDING_DELETION =
  'This account is deleted and can be restored for 30 days.'

export async function deletedAtOf(userId: string): Promise<Date | null> {
  const row = await db.query.user.findFirst({
    where: { id: userId },
    columns: { deletedAt: true },
  })
  return row?.deletedAt ?? null
}
