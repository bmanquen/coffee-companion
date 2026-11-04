// The E2E persona allow-list. Runtime reads it; only packages/api/test/
// mutates it (fixture ids). Not in package.json exports.
export const e2eAuthAllowList = new Set<string>()
