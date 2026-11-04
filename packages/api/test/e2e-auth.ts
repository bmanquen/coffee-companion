import '../src/lib/e2e-auth'
import { e2eAuthAllowList } from '../src/lib/e2e-auth-allow-list'

// Integration fixtures authenticate through the same bypass as HTTP E2E.
// HTTP stays on the four seeded personas; callers register the ids they seed.
export function allowE2EAuthUsers(ids: Iterable<string>) {
  for (const id of ids) {
    const trimmed = id.trim()
    if (trimmed) e2eAuthAllowList.add(trimmed)
  }
}
