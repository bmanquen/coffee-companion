import { sql } from 'drizzle-orm'
import { db } from '../db'

// Railway pings the health route every few seconds, so a database that has
// stopped answering has to lose rather than hold the request open until the
// platform's own timeout.
const TIMEOUT_MS = 2_000

// Losing the race abandons the query but cannot cancel it, so without sharing
// one probe a stalled database would collect a connection per poll — and the
// route is public, so per request — until the pool the rest of the app shares
// is gone. A probe already running is the answer to every caller waiting on
// one, until it has been outstanding long enough to be presumed lost: a
// connection that stays open and never answers must not wedge the endpoint at
// 503 after the database comes back.
const STALE_MS = 30_000

let inFlight: Promise<unknown> | null = null
let startedAt = 0

function probe(query: () => Promise<unknown>): Promise<unknown> {
  if (inFlight && Date.now() - startedAt < STALE_MS) return inFlight

  const started = query()
  // Also the only handler an abandoned rejection gets. A probe already given up
  // on settling later must not clear the one that replaced it.
  const settled = () => {
    if (inFlight === started) inFlight = null
  }
  started.then(settled, settled)

  inFlight = started
  startedAt = Date.now()
  return started
}

// Answers rather than throws: the route turns this into a status code, and a
// thrown error there would be a 500 that says nothing about the database.
export async function checkDatabase(
  query: () => Promise<unknown> = () => db.execute(sql`select 1`),
): Promise<'ok' | 'unreachable'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      probe(query),
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
