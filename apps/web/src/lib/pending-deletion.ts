export function isPendingDeletion(user: object): boolean {
  if (!('deletedAt' in user)) return false
  const deletedAt = user.deletedAt
  return deletedAt != null && deletedAt !== ''
}
