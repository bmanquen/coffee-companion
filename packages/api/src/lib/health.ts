import { sql } from 'drizzle-orm'
import { db } from '../db'

// Railway pings the health route every few seconds, so a database that has
// stopped answering has to lose rather than hold the request open until the
// platform's own timeout.
const TIMEOUT_MS = 2_000

// Answers rather than throws: the route turns this into a status code, and a
// thrown error there would be a 500 that says nothing about the database.
export async function checkDatabase(
  query: () => Promise<unknown> = () => db.execute(sql`select 1`),
): Promise<'ok' | 'unreachable'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      query(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), TIMEOUT_MS)
      }),
    ])
    return 'ok'
  } catch {
    return 'unreachable'
  } finally {
    clearTimeout(timer)
  }
}
