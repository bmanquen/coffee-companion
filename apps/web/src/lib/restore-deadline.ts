import { restoreDeadline } from '@coffee-companion/api/lib/account-restore-window'

export function formatRestoreDeadline(
  deletedAt: Date,
  timeZone?: string,
): string {
  return restoreDeadline(deletedAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  })
}

export function restoreDeadlineCopy(
  deletedAt: Date,
  timeZone?: string,
): string {
  return `Restore your account before ${formatRestoreDeadline(deletedAt, timeZone)} to keep it. Your account data will be deleted on or after that day.`
}
