import { afterAll, beforeAll } from 'vitest'
import { inArray } from 'drizzle-orm'
import { db } from '../src/db'
import { user } from '../src/db/schema'
import { createCallerFactory } from '../src/trpc/init'
import { trpcRouter } from '../src/trpc/router'

// Shared setup for the per-router integration tests. Each router has its own
// `<router>.integration.test.ts` file; they all authenticate through the e2e
// cookie bypass instead of mocking better-auth. Enabling it here (imported by
// every integration file) keeps those files free of auth boilerplate.
//
// See src/lib/e2e-auth.ts for the bypass: with E2E_BYPASS_AUTH set, an
// `e2e_auth=<userId>` cookie authenticates the request as that user.
process.env.E2E_BYPASS_AUTH = 'true'

export const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000'

// A caller authenticated as the given user id (must exist in the `user` table).
export const callerFor = (userId: string) =>
  createCallerFactory(trpcRouter)({
    headers: new Headers({ cookie: `e2e_auth=${userId}` }),
  })

// A caller with no bypass cookie → treated as unauthenticated.
export const anonCaller = createCallerFactory(trpcRouter)({
  headers: new Headers(),
})

// Unique names sidestep cross-run collisions on globally-unique lookup columns;
// scope rows to a per-file test user so they cascade-delete with that user.
export const uniqFor = (userId: string) => (label: string) =>
  `${label} ${userId} ${Math.random()}`

// Registers beforeAll/afterAll to seed the given test users and tear them down.
// Deleting the users cascades all their scoped rows, so most files need no other
// cleanup; pass `onCleanup` for global rows (e.g. device types) that don't
// cascade. The DB client is closed last. Call this before registering any
// fixture beforeAll so the users exist by the time those fixtures run.
export function seedUsers(
  ids: Array<string>,
  onCleanup?: () => Promise<void> | void,
) {
  beforeAll(async () => {
    await db.delete(user).where(inArray(user.id, ids))
    await db
      .insert(user)
      .values(ids.map((id) => ({ id, name: id, email: `${id}@example.com` })))
  })
  afterAll(async () => {
    await db.delete(user).where(inArray(user.id, ids))
    await onCleanup?.()
    await db.$client.end()
  })
}
