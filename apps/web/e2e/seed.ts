import { seedE2eUsers } from '@coffee-companion/api/db/seed-e2e'

// Playwright global setup: seed the bypass users that need content — the
// granted one and the Free one. The empty bypass user is intentionally left
// unseeded.
export default async function seed() {
  await seedE2eUsers()
}
