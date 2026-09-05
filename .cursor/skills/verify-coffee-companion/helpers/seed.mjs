#!/usr/bin/env node
// Verification scaffolding: reseed the e2e bypass users on the test database.
// Deletes and re-inserts e2e-user-with-data and e2e-user-free. Never run this
// against a development or production DATABASE_URL.
//
// Resolve the API package from the file graph (this file sits outside
// apps/web, so a bare `@coffee-companion/api` import would miss node_modules).
import { seedE2eUsers } from '../../../../packages/api/src/db/seed-e2e.ts'

await seedE2eUsers()
