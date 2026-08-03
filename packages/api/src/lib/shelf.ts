import { and, eq, isNull, notInArray, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  aeropressBrews,
  coldBrewBrews,
  espressoShots,
  frenchpressBrews,
  pouroverBrews,
} from '../db/schema'
import { shelfSizes } from './plan'
import type { PlanId } from './plan'

// Every table a Brew can live in. The Shelf query below lists them again in
// SQL, so a new Brewing Method touches both.
const brewTables = [
  espressoShots,
  aeropressBrews,
  pouroverBrews,
  frenchpressBrews,
  coldBrewBrews,
]

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
): Promise<Array<string>> {
  const rows = await db.execute<{ id: string }>(sql`
    select c.id
    from coffees c
    left join (
      select coffee_id, created_at from espresso_shots where user_id = ${userId}
      union all
      select coffee_id, created_at from aeropress_brews where user_id = ${userId}
      union all
      select coffee_id, created_at from pourover_brews where user_id = ${userId}
      union all
      select coffee_id, created_at from frenchpress_brews where user_id = ${userId}
      union all
      select coffee_id, created_at from cold_brew_brews where user_id = ${userId}
    ) b on b.coffee_id = c.id
    where c.user_id = ${userId}
    group by c.id, c.created_at
    order by coalesce(max(b.created_at), c.created_at) desc
    limit ${size}
  `)
  return rows.rows.map((row) => row.id)
}

export async function loadShelf(userId: string, plan: PlanId): Promise<Shelf> {
  const size = shelfSizes[plan]
  if (size === null) return null
  return new Set(await shelfCoffeeIds(userId, size))
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
// So this must run before anything that can hand a Coffee its slot back, always
// against the Shelf as it stands *before* that happens. Two things can:
//
//   - logging a Brew, which lifts its Coffee to the top of the Shelf;
//   - deleting a Coffee or a Brew, which drops whatever was ranked by it and
//     promotes what sat beneath.
//
// Adding a Coffee only ever displaces, so it needs no stamp: what it pushes off
// is withheld by the Shelf alone until something above is removed. Reads never
// stamp at all.
export async function stampFallenBrews(
  userId: string,
  plan: PlanId,
): Promise<void> {
  // Deliberately a fresh Shelf rather than the request's: several Brews can be
  // logged in one request, and stamping against a Shelf an earlier one has
  // already reordered would leave a fallen Coffee's Brews unstamped.
  const shelf = await loadShelf(userId, plan)
  if (shelf === null) return

  const onShelf = [...shelf]
  const stamp = new Date()

  // Idempotent: only unstamped Brews are touched, so a Brew Sealed earlier
  // keeps its original stamp.
  await Promise.all(
    brewTables.map((table) =>
      db
        .update(table)
        .set({ sealedAt: stamp })
        .where(
          and(
            eq(table.userId, userId),
            isNull(table.sealedAt),
            // An empty Shelf means every Coffee has fallen off it.
            onShelf.length ? notInArray(table.coffeeId, onShelf) : undefined,
          ),
        ),
    ),
  )
}

// Withheld when the Shelf is limited and the Brew either carries a stamp or
// sits on a Coffee that has fallen off. Reading it depends on no prior write:
// the Shelf alone decides, and the stamp only keeps a Brew withheld after its
// Coffee comes back.
export function isSealed(brew: SealableBrew, shelf: Shelf): boolean {
  if (shelf === null) return false
  return brew.sealedAt !== null || !shelf.has(brew.coffeeId)
}

// What a user can still identify: which Brew, on which Coffee, whether it is
// that Coffee's reference, and when. Everything else is the past they have not
// paid to read, so it comes back null and the type says so.
//
// isDialedIn is here because a Sealed dial-in is still shown as the Coffee's
// reference Brew — blanking the flag would have the dial-in feed return rows
// denying they are dial-ins. It reports a Brew's standing, never its settings.
type ReadableWhenSealed =
  | 'id'
  | 'userId'
  | 'coffeeId'
  | 'coffee'
  | 'isDialedIn'
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
  isDialedIn: true,
  sealedAt: true,
  createdAt: true,
  updatedAt: true,
}

const readableWhenSealed = new Set<string>(Object.keys(readableFields))

// Blanks a Sealed Brew rather than dropping it, so the feed still shows that it
// exists and which Coffee it belongs to. That holds for the dial-ins too: a
// Sealed dial-in is still the Coffee's reference Brew, it just cannot be read.
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

export async function sealBrewPage<T extends SealableBrew>(
  shelf: () => Promise<Shelf>,
  load: () => Promise<{ items: Array<T>; total: number }>,
): Promise<{ items: Array<Sealable<T>>; total: number }> {
  const [page, resolved] = await Promise.all([load(), shelf()])
  return {
    items: page.items.map((brew) => withSealing(brew, resolved)),
    total: page.total,
  }
}

export async function sealBrew<T extends SealableBrew>(
  shelf: () => Promise<Shelf>,
  load: () => Promise<T>,
): Promise<Sealable<T>> {
  const [brew, resolved] = await Promise.all([load(), shelf()])
  return withSealing(brew, resolved)
}

// A Brew carried on some other row — the coffee list's dialed-in shot. Takes
// the Shelf already resolved, since the caller resolved it to map the rows it
// hangs off, and passes null through for a row that has no Brew at all.
export function sealNestedBrew<T extends SealableBrew>(
  brew: T | null,
  shelf: Shelf,
): Sealable<T> | null {
  return brew && withSealing(brew, shelf)
}
