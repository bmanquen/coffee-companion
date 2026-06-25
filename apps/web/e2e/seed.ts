import { seedE2eUser } from '@coffee-companion/api/db/seed-e2e'

// Playwright global setup: seed the with-data bypass user so authenticated
// pages have content. The empty bypass user is intentionally left unseeded.
export default async function seed() {
  await seedE2eUser()
}
