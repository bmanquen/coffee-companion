import { and, eq, isNull, notInArray, sql } from 'drizzle-orm'
import { db } from '../db'
import { espressoShots } from '../db/schema'
import { shelfSizes } from './plan'
import type { PlanId } from './plan'

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

// Idempotent: only unstamped Brews are touched, so a Brew Sealed earlier keeps
// its original stamp. Runs on read because a Grant can expire with no event to
// react to.
export async function reconcileSeals(
  userId: string,
  plan: PlanId,
): Promise<void> {
  const size = shelfSizes[plan]
  if (size === null) return

  const shelf = await shelfCoffeeIds(userId, size)

  await db
    .update(espressoShots)
    .set({ sealedAt: new Date() })
    .where(
      and(
        eq(espressoShots.userId, userId),
        isNull(espressoShots.sealedAt),
        // An empty Shelf means every Coffee has fallen off it.
        shelf.length ? notInArray(espressoShots.coffeeId, shelf) : undefined,
      ),
    )
}

// Readability is the stamp plus the Plan, never the stamp alone.
export function isSealed(
  brew: { sealedAt: Date | null },
  plan: PlanId,
): boolean {
  return shelfSizes[plan] !== null && brew.sealedAt !== null
}

// What a user can still identify: which Brew, on which Coffee, and when.
// Everything else is the past they have not paid to read, so it comes back
// null and the type says so.
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
// exists and which Coffee it belongs to.
export function withSealing<T extends { sealedAt: Date | null }>(
  brew: T,
  plan: PlanId,
): Sealable<T> {
  if (!isSealed(brew, plan)) {
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
