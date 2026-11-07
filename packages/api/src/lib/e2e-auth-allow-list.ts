// The E2E persona allow-list. Seeded with the four HTTP personas.
// Runtime reads it; only packages/api/test/ mutates it (extra fixture ids).
// Not in package.json exports.
export const E2E_USER_WITH_DATA = 'e2e-user-with-data'
export const E2E_USER_EMPTY = 'e2e-user-empty'
// Holds the same library as E2E_USER_WITH_DATA but no Grant, so the two of them
// read the same rows on different Plans.
export const E2E_USER_FREE = 'e2e-user-free'
export const E2E_USER_DELETE = 'e2e-user-delete'

export const e2eAuthAllowList = new Set<string>([
  E2E_USER_WITH_DATA,
  E2E_USER_EMPTY,
  E2E_USER_FREE,
  E2E_USER_DELETE,
])
