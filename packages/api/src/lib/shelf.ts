import { TRPCError } from '@trpc/server'
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { db } from '../db'
import {
  aeropressBrews,
  brewingDevices,
  coffees,
  coldBrewBrews,
  espressoShots,
  frenchpressBrews,
  grinders,
  pouroverBrews,
  relations,
} from '../db/schema'
import { PG_SERIALIZATION_FAILURE, pgErrorIn } from './pg-error'
import { shelfSizes } from './plan'
import type { PlanId } from './plan'

// Every table a Brew can live in. Both the Shelf query and Sealing's write are
// built from this list, so a new Brewing Method is added here once.
const brewTables = [
  espressoShots,
  aeropressBrews,
  pouroverBrews,
  frenchpressBrews,
  coldBrewBrews,
]

// How many of the user's Brews, of every method, use one Coffee, Grinder or
// Brewing Device: the Brews deleting it cascades to. Sealed Brews count too,
// since they go with it.
export async function countBrewsUsing(
  userId: string,
  column: 'coffeeId' | 'grinderId' | 'brewingDeviceId',
  id: string,
): Promise<number> {
  // A Coffee or gear the user doesn't own isn't theirs to delete, so nothing
  // goes, even when one of their own Brews points at it.
  const parent = {
    coffeeId: coffees,
    grinderId: grinders,
    brewingDeviceId: brewingDevices,
  }[column]
  const owned = await db.$count(
    parent,
    and(eq(parent.id, id), eq(parent.userId, userId)),
  )
  if (owned === 0) return 0

  const counts = await Promise.all(
    brewTables.map((table) =>
      db.$count(table, and(eq(table.userId, userId), eq(table[column], id))),
    ),
  )
  return counts.reduce((sum, n) => sum + n, 0)
}

// The Coffees a user may read the Brews of, or null when their Plan holds the
// whole library. A Set because every Brew of every feed is tested against it.
export type Shelf = ReadonlySet<string> | null

// The fields Sealing reads. Every Brew table carries both, via brewBase.
export interface SealableBrew {
  sealedAt: Date | null
  coffeeId: string
}

// Ordered by each Coffee's last Brew across every method, since a Coffee's
// latest Brew may belong to any of them.
async function shelfCoffeeIds(
  userId: string,
  size: number,
  executor: Pick<typeof db, 'execute'>,
): Promise<Array<string>> {
  const everyBrew = sql.join(
    brewTables.map(
      (table) => sql`
        select ${table.coffeeId} as coffee_id, ${table.createdAt} as created_at
        from ${table}
        where ${eq(table.userId, userId)}
      `,
    ),
    sql` union all `,
  )

  const rows = await executor.execute<{ id: string }>(sql`
    select c.id
    from coffees c
    left join (${everyBrew}) b on b.coffee_id = c.id
    where c.user_id = ${userId}
    group by c.id, c.created_at
    order by coalesce(max(b.created_at), c.created_at) desc
    limit ${size}
  `)
  return rows.rows.map((row) => row.id)
}

// Pass a transaction to read the Shelf in the same snapshot as the Brews.
export async function loadShelf(
  userId: string,
  plan: PlanId,
  executor: Pick<typeof db, 'execute'> = db,
): Promise<Shelf> {
  const size = shelfSizes[plan]
  if (size === null) return null
  return new Set(await shelfCoffeeIds(userId, size, executor))
}

// Resolves the Shelf on first use and shares it thereafter. A request that
// reads six feeds pays for the query once; one that only writes never pays.
export function shelfLoader(
  userId: string,
  plan: PlanId,
): () => Promise<Shelf> {
  let pending: Promise<Shelf> | undefined
  return () => (pending ??= loadShelf(userId, plan))
}

// Sealing's only write. A Brew is withheld the moment its Coffee falls off the
// Shelf with nothing written; the stamp is what keeps it withheld once that
// Coffee comes back (ADR-0004).
//
// So it must run before anything that can hand a Coffee its slot back, always
// against the Shelf as it stands *before* that happens. Three things can:
//
//   - logging a Brew, which lifts its Coffee to the top of the Shelf;
//   - moving a Brew to another Coffee, which lifts that Coffee the same way;
//   - deleting a Coffee, a Brew, or a grinder or brewing device (whose Brews
//     cascade with it), which drops whatever was ranked by them and promotes
//     what sat beneath.
//
// Adding a Coffee only ever displaces, so it needs no stamp: what it pushes off
// is withheld by the Shelf alone until something above is removed. Reads never
// stamp at all.
//
// Each of those writes runs as `write`, in the stamp's transaction and under a
// per-user lock, so two of them cannot both stamp before either writes: that
// interleaving reopens Brews every serial order would Seal.
export async function withStampedShelf<T>(
  userId: string,
  plan: PlanId,
  write: (tx: ShelfTx, shelf: Shelf) => Promise<T>,
): Promise<T> {
  const client = await lockShelf(userId)
  let broken = false
  try {
    const locked = drizzle({ client, relations })
    // The Shelf, the stamps and the write from one snapshot, so a Brew saved
    // outside the lock after this Shelf read is not stamped. A concurrent
    // stamp of the same row aborts this one; the retry finds it stamped
    // already.
    for (let attempt = 1; ; attempt++) {
      try {
        return await locked.transaction(
          async (tx) => {
            return write(tx, await stampFallen(tx, userId, plan))
          },
          { isolationLevel: 'repeatable read' },
        )
      } catch (error) {
        if (attempt >= 3 || !pgErrorIn(error, PG_SERIALIZATION_FAILURE)) {
          throw error
        }
      }
    }
  } finally {
    try {
      await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [
        userId,
      ])
    } catch {
      // Dropping the connection ends its session, which releases the lock.
      broken = true
    }
    client.release(broken)
  }
}

const SHELF_LOCK_WAIT_MS = 10_000

export const SHELF_BUSY = 'Your last change is still saving. Try again in a moment.'

// The user's Shelf lock, on the client that will run the write. A session lock
// taken before BEGIN, so the write's snapshot starts after the previous holder
// committed; a transaction lock would be taken inside the snapshot and miss
// that commit. Waiting hands the client back to the pool, so one user's burst
// of writes cannot hold every connection.
// shortcut: polling serves waiters in no particular order; queue them per
// user if writes ever need to land in arrival order.
async function lockShelf(userId: string) {
  const deadline = Date.now() + SHELF_LOCK_WAIT_MS
  for (let pause = 5; ; pause = Math.min(pause * 2, 100)) {
    const client = await db.$client.connect()
    let held: boolean
    try {
      const { rows } = await client.query<{ held: boolean }>(
        'select pg_try_advisory_lock(hashtextextended($1, 0)) as held',
        [userId],
      )
      held = rows[0].held
    } catch (error) {
      client.release(true)
      throw error
    }
    if (held) return client
    client.release()
    if (Date.now() >= deadline) {
      throw new TRPCError({ code: 'TIMEOUT', message: SHELF_BUSY })
    }
    await new Promise((resolve) => setTimeout(resolve, pause))
  }
}

export type ShelfTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function stampFallen(
  tx: ShelfTx,
  userId: string,
  plan: PlanId,
): Promise<Shelf> {
  // Deliberately a fresh Shelf rather than the request's: several Brews can be
  // logged in one request, and stamping against a Shelf an earlier one has
  // already reordered would leave a fallen Coffee's Brews unstamped.
  const shelf = await loadShelf(userId, plan, tx)
  if (shelf === null) return null
  const onShelf = [...shelf]
  const stamp = new Date()

  // Idempotent: only unstamped Brews are touched, so a Brew Sealed earlier
  // keeps its original stamp.
  for (const table of brewTables) {
    await tx
      .update(table)
      .set({ sealedAt: stamp })
      .where(
        and(
          eq(table.userId, userId),
          isNull(table.sealedAt),
          // An empty Shelf means every Coffee has fallen off it.
          onShelf.length ? notInArray(table.coffeeId, onShelf) : undefined,
        ),
      )
  }
  return shelf
}

// Whether a Brew is Sealed as a write inside withStampedShelf sees it. An edit
// checks here, under the lock, because a write queued ahead of it can Seal it.
export async function sealedNow(
  tx: ShelfTx,
  table: (typeof brewTables)[number],
  id: string,
  userId: string,
  shelf: Shelf,
): Promise<boolean> {
  const rows = await tx
    .select({ sealedAt: table.sealedAt, coffeeId: table.coffeeId })
    .from(table)
    .where(and(eq(table.id, id), eq(table.userId, userId)))
  return rows.length > 0 && isSealed(rows[0], shelf)
}

// Withheld when the Shelf is limited and the Brew either carries a stamp or
// sits on a Coffee that has fallen off. Reading it depends on no prior write:
// the Shelf alone decides, and the stamp only keeps a Brew withheld after its
// Coffee comes back.
export function isSealed(brew: SealableBrew, shelf: Shelf): boolean {
  if (shelf === null) return false
  return brew.sealedAt !== null || !shelf.has(brew.coffeeId)
}

// What a user can still identify: which Brew, on which Coffee, and when.
// Everything else is the past they have not paid to read, so it comes back
// null and the type says so. Dialed-in membership is stamped after sealing
// from the membership table, not stored on the brew.
type ReadableWhenSealed =
  | 'id'
  | 'userId'
  | 'coffeeId'
  | 'coffee'
  | 'sealedAt'
  | 'createdAt'
  | 'updatedAt'

// Identifying fields keep their type; everything the paywall withholds gains
// null. Flags blank to false rather than null, so a Sealed Brew never claims to
// be something it no longer reports.
export type Sealable<T> = {
  [K in keyof T]: K extends ReadableWhenSealed
    ? T[K]
    : T[K] extends boolean | null
      ? T[K]
      : T[K] | null
} & { sealed: boolean }

// A Record rather than a list, so this and ReadableWhenSealed cannot drift
// apart: miss a key and it fails to compile, add one the union lacks and it
// fails too. Otherwise the type would promise a field the runtime blanks.
const readableFields: Record<ReadableWhenSealed, true> = {
  id: true,
  userId: true,
  coffeeId: true,
  coffee: true,
  sealedAt: true,
  createdAt: true,
  updatedAt: true,
}

const readableWhenSealed = new Set<string>(Object.keys(readableFields))

// Blanks a Sealed Brew rather than dropping it, so the feed still shows that it
// exists and which Coffee it belongs to. Membership still counts: a Sealed
// Dialed-in Brew stays marked, it just cannot be read.
function withSealing<T extends SealableBrew>(
  brew: T,
  shelf: Shelf,
): Sealable<T> {
  if (!isSealed(brew, shelf)) {
    return { ...brew, sealed: false } as Sealable<T>
  }

  const blanked = Object.fromEntries(
    Object.entries(brew).map(([key, value]) => {
      if (readableWhenSealed.has(key)) return [key, value]
      return [key, typeof value === 'boolean' ? false : null]
    }),
  )
  return { ...blanked, sealed: true } as Sealable<T>
}

// The three wrappers below are how every Brew-returning procedure applies
// Sealing — one per container shape a feed returns. Each takes the query rather
// than its result, so there is no state where a procedure has loaded Brews but
// not sealed them, which is the shape of every leak found so far. They also
// resolve the Shelf alongside the query rather than before it.
//
// Deliberately not a tRPC middleware: tRPC infers a procedure's output type
// from its resolver, so a middleware reshaping the result would leave clients
// typed as though nothing were withheld. Going through a wrapper keeps
// Sealable<T> in the inferred type, so a caller reading a withheld field still
// fails to compile.

export async function sealBrews<T extends SealableBrew>(
  shelf: () => Promise<Shelf>,
  load: () => Promise<Array<T>>,
): Promise<Array<Sealable<T>>> {
  const [brews, resolved] = await Promise.all([load(), shelf()])
  return brews.map((brew) => withSealing(brew, resolved))
}

export async function sealBrewPage<
  TPage extends { items: Array<SealableBrew>; total: number },
>(
  shelf: () => Promise<Shelf>,
  load: () => Promise<TPage>,
): Promise<
  Omit<TPage, 'items'> & { items: Array<Sealable<TPage['items'][number]>> }
> {
  const [page, resolved] = await Promise.all([load(), shelf()])
  return {
    ...page,
    items: page.items.map((brew) => withSealing(brew, resolved)) as Array<
      Sealable<TPage['items'][number]>
    >,
  }
}

export async function sealBrew<T extends SealableBrew>(
  shelf: () => Promise<Shelf>,
  load: () => Promise<T>,
): Promise<Sealable<T>> {
  const [brew, resolved] = await Promise.all([load(), shelf()])
  return withSealing(brew, resolved)
}

// A Brew carried on some other row. Takes the Shelf already resolved, since
// the caller resolved it to map the rows it hangs off, and passes null through
// for a row that has no Brew at all.
export function sealNestedBrew<T extends SealableBrew>(
  brew: T | null,
  shelf: Shelf,
): Sealable<T> | null {
  return brew && withSealing(brew, shelf)
}
